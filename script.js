document.addEventListener('DOMContentLoaded', () => {
    // 替换为您的 Apps Script Web App URL
    const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7Kk7Fl01-gHgS-cAQYAqIzqhUOVb2HO9liK4FNbXZTacYTwqtDy784-sezU--2xPn/exec';

    const $ = id => document.getElementById(id);
    
    let currentUser = null;
    let configPrices = { BeautyTechEmail: 'zzhou@pcis.lvmh-pc.com', VarianceThreshold: 15 };
    let allUsers = [];
    let searchTerm = '';
    let currentYear = new Date().getFullYear();
    let currentFiscalYear = 2026;
    let monthlyDataCache = {};

    // Admin 全局状态
    let adminGlobalYear = 2026;
    let adminBudgetMaison = 'ACQUA DI PARMA SRL';
    let adminForecastMaison = 'ACQUA DI PARMA SRL';
    let adminActualMaison = 'ACQUA DI PARMA SRL';

    // Maison 列表配置
    const MAISONS = [
        { name: 'ACQUA DI PARMA SRL', shortName: 'ADP' },
        { name: 'Maison Francis Kurkdjian', shortName: 'MFK' },
        { name: 'GIE PCIS (Org MUF Education)', shortName: 'MUFE' },
        { name: 'PARFUMS ET COSMETIQUES INFORMATION SERVICES', shortName: 'PCIS' },
        { name: 'PERFUMES LOEWE SA', shortName: 'LOEWE' }
    ];

    // ===== 工具函数 =====
    const showPage = page => {
        document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        page.classList.remove('hidden');
        page.classList.add('active');
    };

    const msg = (el, text, ok = false) => {
        if (!el) return;
        el.textContent = text;
        el.className = ok ? 'message success' : 'message';
    };

    const clr = el => { 
        if (!el) return;
        el.textContent = ''; 
        el.className = 'message'; 
    };
    
    const valid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const fmt = ts => {
        try {
            const d = new Date(ts);
            return isNaN(d) ? ts : d.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return ts; }
    };

    // Generate 12 months for a fiscal year (Feb to Jan)
    const getFiscalYearMonths = (fiscalYear) => {
        const months = [];
        for (let i = 2; i <= 12; i++) {
            months.push({ year: fiscalYear, month: String(i).padStart(2, '0') });
        }
        months.push({ year: fiscalYear + 1, month: '01' });
        return months;
    };

    // Format month for display (e.g., "2026-02")
    const formatMonth = (year, month) => `${year}-${month}`;

    // Get month name
    const getMonthName = (month) => {
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return names[parseInt(month) - 1];
    };

    // Get short name for maison
    const getMaisonShortName = (maisonName) => {
        const maison = MAISONS.find(m => m.name === maisonName);
        return maison ? maison.shortName : maisonName;
    };

    // ===== API 调用 =====
    const api = async (act, data = {}) => {
        const silent = ['getConfig', 'checkExistingRecord', 'getUserEmail', 'getAllUsers', 'getAllSfmcHistory', 
                        'getMaisonSfmcHistory', 'getForecastData', 'getAnnualBudgets', 'getSfmcDataByMaison',
                        'getAnnualBudgetByMaison', 'getActualData', 'getActualDataByMaison'];
        const loading = !silent.includes(act);

        try {
            if (loading) msg($('loginMessage'), 'Requesting...', true);
            
            const res = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: act, ...data })
            });
            return await res.json();
        } catch (e) {
            console.error('API Error:', e);
            return { success: false, message: 'Network error: ' + e.message };
        } finally {
            if (loading) clr($('loginMessage'));
        }
    };

    // ===== Maison View Functions (保持原有逻辑) =====
    
    // Modal Control Functions
    const openModal = (year, month, existingData = null) => {
        const modal = $('submissionModal');
        const modalTitle = $('modalTitle');
        
        $('modalYear').value = year;
        $('modalMonth').value = month;
        
        modalTitle.textContent = `${existingData ? 'Update' : 'Submit'} Data for ${formatMonth(year, month)}`;
        
        $('modalEmailInput').value = existingData ? existingData.EmailCount : '';
        $('modalSmsInput').value = existingData ? existingData.SMSCount : '';
        $('modalWhatsappInput').value = existingData ? existingData.WhatsAppCount : '';
        $('modalContactsInput').value = existingData ? existingData.ContactsCount : '';
        $('modalNotesInput').value = existingData ? (existingData.MaisonNotes || '') : '';
        
        const notesLength = $('modalNotesInput').value.length;
        $('modalNotesCharCount').textContent = `${notesLength}/200`;
        
        if (existingData && existingData.ApprovalStatus === 'Rejected' && existingData.AdminNotes) {
            $('modalAdminNotesSection').classList.remove('hidden');
            $('modalAdminNotesDisplay').textContent = existingData.AdminNotes;
        } else {
            $('modalAdminNotesSection').classList.add('hidden');
        }
        
        $('modalSubmitButton').textContent = existingData ? 'Update' : 'Submit';
        
        modal.classList.remove('hidden');
    };

    const closeModal = () => {
        const modal = $('submissionModal');
        modal.classList.add('hidden');
        
        $('modalEmailInput').value = '';
        $('modalSmsInput').value = '';
        $('modalWhatsappInput').value = '';
        $('modalContactsInput').value = '';
        $('modalNotesInput').value = '';
        $('modalNotesCharCount').textContent = '0/200';
        $('modalAdminNotesSection').classList.add('hidden');
    };

    // Render Monthly Data Table for Maison
    const renderMonthlyDataTable = async () => {
        const tbody = $('monthlyDataTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading...</td></tr>';
        
        const months = getFiscalYearMonths(currentFiscalYear);
        
        const res = await api('getMaisonSfmcData', { submittedBy: currentUser.username });
        
        const dataMap = {};
        if (res.success && res.data) {
            res.data.forEach(record => {
                const formattedMonth = String(record.Month).padStart(2, '0');
                const key = `${record.Year}-${formattedMonth}`;
                dataMap[key] = record;
            });
        }
        
        let html = '';
        months.forEach(({ year, month }) => {
            const key = formatMonth(year, month);
            const existingData = dataMap[key];
            
            const monthDisplay = `${year}-${month}`;
            const status = existingData ? existingData.ApprovalStatus : '-';
            const statusClass = status === 'Approved' ? 'status-approved' : 
                               status === 'Pending' ? 'status-pending' : 
                               status === 'Rejected' ? 'status-rejected' : '';
            
            const emailVal = existingData ? existingData.EmailCount : '';
            const smsVal = existingData ? existingData.SMSCount : '';
            const whatsappVal = existingData ? existingData.WhatsAppCount : '';
            const contactsVal = existingData ? existingData.ContactsCount : '';
            
            const buttonText = existingData ? 'Update' : 'Submit';
            const buttonClass = existingData ? 'action-button-table update-button' : 'action-button-table';
            
            let statusCell = `<span class="${statusClass}"><span class="status-badge-cell">${status}</span></span>`;
            
            let notesCell = '-';
            if (existingData && (existingData.MaisonNotes || existingData.AdminNotes)) {
                notesCell = `<a href="javascript:void(0)" class="notes-link" data-year="${year}" data-month="${month}">See</a>`;
            }
            
            html += `
                <tr data-year="${year}" data-month="${month}">
                    <td class="month-cell">${monthDisplay}</td>
                    <td><input type="number" class="month-input" data-field="email" value="${emailVal}" min="0" readonly></td>
                    <td><input type="number" class="month-input" data-field="sms" value="${smsVal}" min="0" readonly></td>
                    <td><input type="number" class="month-input" data-field="whatsapp" value="${whatsappVal}" min="0" readonly></td>
                    <td><input type="number" class="month-input" data-field="contacts" value="${contactsVal}" min="0" readonly></td>
                    <td>${statusCell}</td>
                    <td>${notesCell}</td>
                    <td>
                        <button class="${buttonClass}" 
                                data-year="${year}" 
                                data-month="${month}"
                                data-has-data="${existingData ? 'true' : 'false'}">
                            ${buttonText}
                        </button>
                    </td>
                </tr>
            `;
        });
        
        let totalEmail = 0;
        let totalSms = 0;
        let totalWhatsapp = 0;
        let totalContacts = 0;
        
        Object.values(dataMap).forEach(data => {
            if (data.ApprovalStatus === 'Approved') {
                totalEmail += parseInt(data.EmailCount) || 0;
                totalSms += parseInt(data.SMSCount) || 0;
                totalWhatsapp += parseInt(data.WhatsAppCount) || 0;
                totalContacts += parseInt(data.ContactsCount) || 0;
            }
        });
        
        const grandTotal = totalEmail + totalSms + totalWhatsapp + totalContacts;
        
        html += `
            <tr class="total-row">
                <td class="total-cell"><strong>Total (Approved)</strong></td>
                <td class="total-value"><strong>${totalEmail}</strong></td>
                <td class="total-value"><strong>${totalSms}</strong></td>
                <td class="total-value"><strong>${totalWhatsapp}</strong></td>
                <td class="total-value"><strong>${totalContacts}</strong></td>
                <td class="total-cell">-</td>
                <td class="total-cell">-</td>
                <td class="total-grand"><strong>Grand Total: ${grandTotal}</strong></td>
            </tr>
        `;
        
        tbody.innerHTML = html;
        monthlyDataCache[currentFiscalYear] = dataMap;
    };

    const openNotesViewModal = (year, month) => {
        const key = formatMonth(year, month);
        const data = monthlyDataCache[currentFiscalYear]?.[key];
        
        if (!data) return;
        
        const modal = $('notesViewModal');
        const title = $('notesViewTitle');
        
        title.textContent = `Notes for ${formatMonth(year, month)}`;
        
        const maisonNotesDisplay = $('maisonNotesDisplay');
        if (data.MaisonNotes && data.MaisonNotes.trim()) {
            maisonNotesDisplay.textContent = data.MaisonNotes;
        } else {
            maisonNotesDisplay.textContent = '';
        }
        
        const adminNotesSection = $('adminNotesViewSection');
        const adminNotesDisplay = $('adminNotesViewDisplay');
        
        if (data.AdminNotes && data.AdminNotes.trim()) {
            adminNotesSection.classList.remove('hidden');
            adminNotesDisplay.textContent = data.AdminNotes;
        } else {
            adminNotesSection.classList.add('hidden');
            adminNotesDisplay.textContent = '';
        }
        
        modal.classList.remove('hidden');
    };

    const closeNotesViewModal = () => {
        const modal = $('notesViewModal');
        modal.classList.add('hidden');
    };

    const switchFiscalYearTab = (fiscalYear) => {
        currentFiscalYear = fiscalYear;
        
        document.querySelectorAll('.fy-tab-button').forEach(btn => {
            if (parseInt(btn.dataset.year) === fiscalYear) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        renderMonthlyDataTable();
    };

    const handleModalSubmit = async () => {
        const year = parseInt($('modalYear').value);
        const month = $('modalMonth').value;
        const emailCount = $('modalEmailInput').value.trim();
        const smsCount = $('modalSmsInput').value.trim();
        const whatsappCount = $('modalWhatsappInput').value.trim();
        const contactsCount = $('modalContactsInput').value.trim();
        const maisonNotes = $('modalNotesInput').value.trim();
        
        if (!emailCount || !smsCount || !whatsappCount || !contactsCount) {
            alert('Please fill in all four metrics (Email, SMS, WhatsApp, Contacts).');
            return;
        }
        
        const emailNum = parseInt(emailCount);
        const smsNum = parseInt(smsCount);
        const whatsappNum = parseInt(whatsappCount);
        const contactsNum = parseInt(contactsCount);
        
        if (emailNum < 0 || smsNum < 0 || whatsappNum < 0 || contactsNum < 0) {
            alert('Quantities cannot be negative!');
            return;
        }
        
        let confirmMsg = `You are about to submit the following data:\n\n`;
        confirmMsg += `Year-Month: ${year}-${month}\n`;
        confirmMsg += `Email: ${emailNum}\n`;
        confirmMsg += `SMS: ${smsNum}\n`;
        confirmMsg += `WhatsApp: ${whatsappNum}\n`;
        confirmMsg += `Contacts: ${contactsNum}\n`;
        
        if (maisonNotes) {
            confirmMsg += `\nYour Notes: ${maisonNotes}\n`;
        }
        
        confirmMsg += '\nDo you want to proceed?';
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        const res = await api('submitSfmcData', {
            maisonName: currentUser.maisonName,
            year: year,
            month: month,
            emailCount: emailNum,
            smsCount: smsNum,
            whatsappCount: whatsappNum,
            contactsCount: contactsNum,
            submittedBy: currentUser.username,
            maisonNotes: maisonNotes
        });
        
        if (res.success) {
            msg($('monthlyDataMessage'), 'Data submitted successfully!', true);
            closeModal();
            
            renderMonthlyDataTable();
            loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
            
            setTimeout(() => clr($('monthlyDataMessage')), 3000);
        } else {
            alert('Failed to submit data: ' + res.message);
        }
    };
    // ===== Admin View Functions =====

    // Switch Global Year
    const switchGlobalYear = (year) => {
        adminGlobalYear = year;
        
        // Update tab buttons
        document.querySelectorAll('.global-year-tab').forEach(btn => {
            if (parseInt(btn.dataset.year) === year) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Refresh all sections
        loadAdminBudget();
        loadAdminForecast();
        loadAdminActual();
    };

    // Load Admin Budget
    const loadAdminBudget = async () => {
        const res = await api('getAnnualBudgetByMaison', { 
            maisonName: adminBudgetMaison, 
            year: adminGlobalYear 
        });
        
        if (res.success && res.data) {
            $('adminEmailBudget').value = res.data.EmailBudget || 0;
            $('adminSmsBudget').value = res.data.SMSBudget || 0;
            $('adminWhatsappBudget').value = res.data.WhatsAppBudget || 0;
            $('adminContactsBudget').value = res.data.ContactsBudget || 0;
        } else {
            $('adminEmailBudget').value = 0;
            $('adminSmsBudget').value = 0;
            $('adminWhatsappBudget').value = 0;
            $('adminContactsBudget').value = 0;
        }
    };

    // Submit Admin Budget
    const submitAdminBudget = async () => {
        const emailBudget = parseInt($('adminEmailBudget').value) || 0;
        const smsBudget = parseInt($('adminSmsBudget').value) || 0;
        const whatsappBudget = parseInt($('adminWhatsappBudget').value) || 0;
        const contactsBudget = parseInt($('adminContactsBudget').value) || 0;
        
        if (emailBudget < 0 || smsBudget < 0 || whatsappBudget < 0 || contactsBudget < 0) {
            msg($('adminBudgetMessage'), 'Budgets cannot be negative!', false);
            return;
        }
        
        const res = await api('setAnnualBudget', {
            maisonName: adminBudgetMaison,
            year: adminGlobalYear,
            emailBudget: emailBudget,
            smsBudget: smsBudget,
            whatsappBudget: whatsappBudget,
            contactsBudget: contactsBudget,
            updatedBy: currentUser.username
        });
        
        msg($('adminBudgetMessage'), res.success ? 'Budget set successfully!' : 'Failed: ' + res.message, res.success);
        
        if (res.success) {
            setTimeout(() => clr($('adminBudgetMessage')), 3000);
            loadAdminForecast();
            loadAdminActual();
        }
    };

    // Load Admin Forecast
    const loadAdminForecast = async () => {
        const container = $('forecastTableContainer');
        if (!container) return;
        
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
        
        const res = await api('getSfmcDataByMaison', { 
            maisonName: adminForecastMaison, 
            year: adminGlobalYear 
        });
        
        const budgetRes = await api('getAnnualBudgetByMaison', { 
            maisonName: adminForecastMaison, 
            year: adminGlobalYear 
        });
        
        const months = getFiscalYearMonths(adminGlobalYear);
        
        const dataMap = {};
        if (res.success && res.data) {
            res.data.forEach(record => {
                const formattedMonth = String(record.Month).padStart(2, '0');
                const key = `${record.Year}-${formattedMonth}`;
                dataMap[key] = record;
            });
        }
        
        const budget = budgetRes.success && budgetRes.data ? budgetRes.data : 
            { EmailBudget: 0, SMSBudget: 0, WhatsAppBudget: 0, ContactsBudget: 0 };
        
        const maisonShortName = getMaisonShortName(adminForecastMaison);
        
        let html = `<h4 style="padding: 15px; margin: 0; background-color: #e0f2f7; border-bottom: 1px solid #ddd;">${maisonShortName} - Monthly Forecast - FY${adminGlobalYear}</h4>`;
        html += '<table><thead><tr>';
html += '<th>Month</th><th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th><th>Status</th><th>Notes</th><th>Action</th>';
html += '</tr></thead><tbody>';

        
        let annualForecast = { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
        
        months.forEach(({ year: y, month: m }) => {
            const key = formatMonth(y, m);
            const data = dataMap[key];
            
            const monthDisplay = `${y}-${m}`;
            const status = data ? data.ApprovalStatus : 'Not Submit';
            const statusClass = status === 'Approved' ? 'status-approved' : 
                               status === 'Pending' ? 'status-pending' : 
                               status === 'Rejected' ? 'status-rejected' : 'status-not-submitted';
            
            const emailVal = data ? data.EmailCount : '-';
            const smsVal = data ? data.SMSCount : '-';
            const whatsappVal = data ? data.WhatsAppCount : '-';
            const contactsVal = data ? data.ContactsCount : '-';
            
            if (data && data.ApprovalStatus === 'Approved') {
                annualForecast.email += parseInt(data.EmailCount) || 0;
                annualForecast.sms += parseInt(data.SMSCount) || 0;
                annualForecast.whatsapp += parseInt(data.WhatsAppCount) || 0;
                annualForecast.contacts += parseInt(data.ContactsCount) || 0;
            }
            
            let actionCell = '-';
if (data) {
    actionCell = `<button class="approve-button-table" data-record-id="${data.RecordId}">Approve</button>
                  <button class="reject-button-table" data-record-id="${data.RecordId}">Reject</button>`;
}

// 构建 Notes 单元格
let notesCell = '-';
if (data) {
    let notesContent = '';
    if (data.MaisonNotes && data.MaisonNotes.trim()) {
        notesContent += `<div class="notes-item"><strong>Maison:</strong> ${data.MaisonNotes}</div>`;
    }
    if (data.AdminNotes && data.AdminNotes.trim()) {
        notesContent += `<div class="notes-item admin-note"><strong>Admin:</strong> ${data.AdminNotes}</div>`;
    }
    if (notesContent) {
        notesCell = `<div class="notes-cell">${notesContent}</div>`;
    }
}

html += '<tr>';
html += `<td class="month-cell">${monthDisplay}</td>`;
html += `<td>${emailVal}</td>`;
html += `<td>${smsVal}</td>`;
html += `<td>${whatsappVal}</td>`;
html += `<td>${contactsVal}</td>`;
html += `<td><span class="${statusClass}"><span class="status-badge-cell">${status}</span></span></td>`;
html += `<td>${notesCell}</td>`;
html += `<td>${actionCell}</td>`;
html += '</tr>';

        });
        
        const variance = {
            email: budget.EmailBudget > 0 ? ((annualForecast.email - budget.EmailBudget) / budget.EmailBudget * 100).toFixed(1) : '0.0',
            sms: budget.SMSBudget > 0 ? ((annualForecast.sms - budget.SMSBudget) / budget.SMSBudget * 100).toFixed(1) : '0.0',
            whatsapp: budget.WhatsAppBudget > 0 ? ((annualForecast.whatsapp - budget.WhatsAppBudget) / budget.WhatsAppBudget * 100).toFixed(1) : '0.0',
            contacts: budget.ContactsBudget > 0 ? ((annualForecast.contacts - budget.ContactsBudget) / budget.ContactsBudget * 100).toFixed(1) : '0.0'
        };
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Forecast</td>';
        html += `<td class="summary-value">${annualForecast.email}</td>`;
        html += `<td class="summary-value">${annualForecast.sms}</td>`;
        html += `<td class="summary-value">${annualForecast.whatsapp}</td>`;
        html += `<td class="summary-value">${annualForecast.contacts}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Budget</td>';
        html += `<td class="summary-value">${budget.EmailBudget}</td>`;
        html += `<td class="summary-value">${budget.SMSBudget}</td>`;
        html += `<td class="summary-value">${budget.WhatsAppBudget}</td>`;
        html += `<td class="summary-value">${budget.ContactsBudget}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Variance</td>';
        html += `<td class="summary-value ${getVarianceClass(variance.email)}">${variance.email >= 0 ? '+' : ''}${variance.email}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(variance.sms)}">${variance.sms >= 0 ? '+' : ''}${variance.sms}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(variance.whatsapp)}">${variance.whatsapp >= 0 ? '+' : ''}${variance.whatsapp}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(variance.contacts)}">${variance.contacts >= 0 ? '+' : ''}${variance.contacts}%</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '</tbody></table>';
        
        container.innerHTML = html;
    };

    const getVarianceClass = (variance) => {
        const v = parseFloat(variance);
        if (Math.abs(v) <= 5) return 'variance-neutral';
        return v > 0 ? 'variance-positive' : 'variance-negative';
    };

    // Load Admin Actual
    const loadAdminActual = async () => {
        const container = $('actualTableContainer');
        if (!container) return;
        
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
        
        const actualRes = await api('getActualDataByMaison', { 
            maisonName: adminActualMaison, 
            year: adminGlobalYear 
        });
        
        const forecastRes = await api('getSfmcDataByMaison', { 
            maisonName: adminActualMaison, 
            year: adminGlobalYear 
        });
        
        const budgetRes = await api('getAnnualBudgetByMaison', { 
            maisonName: adminActualMaison, 
            year: adminGlobalYear 
        });
        
        const months = getFiscalYearMonths(adminGlobalYear);
        
        const actualMap = {};
        if (actualRes.success && actualRes.data) {
            actualRes.data.forEach(record => {
                const formattedMonth = String(record.Month).padStart(2, '0');
                const key = `${record.Year}-${formattedMonth}`;
                actualMap[key] = record;
            });
        }
        
        const forecastMap = {};
        if (forecastRes.success && forecastRes.data) {
            forecastRes.data.forEach(record => {
                if (record.ApprovalStatus === 'Approved') {
                    const formattedMonth = String(record.Month).padStart(2, '0');
                    const key = `${record.Year}-${formattedMonth}`;
                    forecastMap[key] = record;
                }
            });
        }
        
        const budget = budgetRes.success && budgetRes.data ? budgetRes.data : 
            { EmailBudget: 0, SMSBudget: 0, WhatsAppBudget: 0, ContactsBudget: 0 };
        
        const maisonShortName = getMaisonShortName(adminActualMaison);
        
        let html = `<h4 style="padding: 15px; margin: 0; background-color: #e0f2f7; border-bottom: 1px solid #ddd;">${maisonShortName} - Monthly Actual Usage - FY${adminGlobalYear}</h4>`;
        html += '<table><thead><tr>';
        html += '<th>Month</th><th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th>';
        html += '<th>Variance vs Forecast</th><th>Recorded By</th><th>Time</th>';
        html += '</tr></thead><tbody>';
        
        let annualActual = { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
        let annualForecast = { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
        
        months.forEach(({ year: y, month: m }) => {
            const key = formatMonth(y, m);
            const actual = actualMap[key];
            const forecast = forecastMap[key];
            
            const monthDisplay = `${y}-${m}`;
            
            const emailActual = actual ? (parseInt(actual.EmailUsage) || 0) : '-';
            const smsActual = actual ? (parseInt(actual.SMSUsage) || 0) : '-';
            const whatsappActual = actual ? (parseInt(actual.WhatsAppUsage) || 0) : '-';
            const contactsActual = actual ? (parseInt(actual.ContactsTotal) || 0) : '-';
            
            if (forecast) {
                annualForecast.email += parseInt(forecast.EmailCount) || 0;
                annualForecast.sms += parseInt(forecast.SMSCount) || 0;
                annualForecast.whatsapp += parseInt(forecast.WhatsAppCount) || 0;
                annualForecast.contacts += parseInt(forecast.ContactsCount) || 0;
            }
            
            if (actual) {
                annualActual.email += parseInt(actual.EmailUsage) || 0;
                annualActual.sms += parseInt(actual.SMSUsage) || 0;
                annualActual.whatsapp += parseInt(actual.WhatsAppUsage) || 0;
                annualActual.contacts = parseInt(actual.ContactsTotal) || 0;
            }
            
            let varianceText = '-';
            if (actual && forecast) {
                const varEmail = calcVariancePercent(parseInt(actual.EmailUsage) || 0, parseInt(forecast.EmailCount) || 0);
                const varSms = calcVariancePercent(parseInt(actual.SMSUsage) || 0, parseInt(forecast.SMSCount) || 0);
                const varWhatsapp = calcVariancePercent(parseInt(actual.WhatsAppUsage) || 0, parseInt(forecast.WhatsAppCount) || 0);
                const varContacts = calcVariancePercent(parseInt(actual.ContactsTotal) || 0, annualForecast.contacts);
                
                varianceText = `${varEmail}% / ${varSms}% / ${varWhatsapp}% / ${varContacts}%`;
            }
            
            const recordedBy = actual ? actual.RecordedBy : '-';
            const timestamp = actual ? fmt(actual.Timestamp) : '-';
            
            html += '<tr>';
            html += `<td class="month-cell">${monthDisplay}</td>`;
            html += `<td>${emailActual}</td>`;
            html += `<td>${smsActual}</td>`;
            html += `<td>${whatsappActual}</td>`;
            html += `<td>${contactsActual}</td>`;
            html += `<td style="font-size: 0.75em;">${varianceText}</td>`;
            html += `<td>${recordedBy}</td>`;
            html += `<td style="font-size: 0.8em;">${timestamp}</td>`;
            html += '</tr>';
        });
        
        const varianceVsForecast = {
            email: calcVariancePercent(annualActual.email, annualForecast.email),
            sms: calcVariancePercent(annualActual.sms, annualForecast.sms),
            whatsapp: calcVariancePercent(annualActual.whatsapp, annualForecast.whatsapp),
            contacts: calcVariancePercent(annualActual.contacts, annualForecast.contacts)
        };
        
        const remaining = {
            email: parseInt(budget.EmailBudget) - annualActual.email,
            sms: parseInt(budget.SMSBudget) - annualActual.sms,
            whatsapp: parseInt(budget.WhatsAppBudget) - annualActual.whatsapp,
            contacts: parseInt(budget.ContactsBudget) - annualActual.contacts
        };
        
        const utilization = {
            email: budget.EmailBudget > 0 ? (annualActual.email / budget.EmailBudget * 100).toFixed(1) : '0.0',
            sms: budget.SMSBudget > 0 ? (annualActual.sms / budget.SMSBudget * 100).toFixed(1) : '0.0',
            whatsapp: budget.WhatsAppBudget > 0 ? (annualActual.whatsapp / budget.WhatsAppBudget * 100).toFixed(1) : '0.0',
            contacts: budget.ContactsBudget > 0 ? (annualActual.contacts / budget.ContactsBudget * 100).toFixed(1) : '0.0'
        };
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Actual</td>';
        html += `<td class="summary-value">${annualActual.email}</td>`;
        html += `<td class="summary-value">${annualActual.sms}</td>`;
        html += `<td class="summary-value">${annualActual.whatsapp}</td>`;
        html += `<td class="summary-value">${annualActual.contacts}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Forecast</td>';
        html += `<td class="summary-value">${annualForecast.email}</td>`;
        html += `<td class="summary-value">${annualForecast.sms}</td>`;
        html += `<td class="summary-value">${annualForecast.whatsapp}</td>`;
        html += `<td class="summary-value">${annualForecast.contacts}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Variance (Actual vs Forecast)</td>';
        html += `<td class="summary-value ${getVarianceClass(varianceVsForecast.email)}">${varianceVsForecast.email}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(varianceVsForecast.sms)}">${varianceVsForecast.sms}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(varianceVsForecast.whatsapp)}">${varianceVsForecast.whatsapp}%</td>`;
        html += `<td class="summary-value ${getVarianceClass(varianceVsForecast.contacts)}">${varianceVsForecast.contacts}%</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Budget</td>';
        html += `<td class="summary-value">${budget.EmailBudget}</td>`;
        html += `<td class="summary-value">${budget.SMSBudget}</td>`;
        html += `<td class="summary-value">${budget.WhatsAppBudget}</td>`;
        html += `<td class="summary-value">${budget.ContactsBudget}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Remaining</td>';
        html += `<td class="summary-value">${remaining.email}</td>`;
        html += `<td class="summary-value">${remaining.sms}</td>`;
        html += `<td class="summary-value">${remaining.whatsapp}</td>`;
        html += `<td class="summary-value">${remaining.contacts}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Utilization</td>';
        html += `<td class="summary-value">${utilization.email}%</td>`;
        html += `<td class="summary-value">${utilization.sms}%</td>`;
        html += `<td class="summary-value">${utilization.whatsapp}%</td>`;
        html += `<td class="summary-value">${utilization.contacts}%</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '</tbody></table>';
        
        container.innerHTML = html;
    };

    const calcVariancePercent = (actual, forecast) => {
        if (!forecast || forecast === 0) return '0.0';
        const variance = ((actual - forecast) / forecast * 100).toFixed(1);
        return variance >= 0 ? `+${variance}` : variance;
    };
    // ===== SFMC Operator View Functions =====

    const initOperatorView = async () => {
        // Populate maison selector
        const maisonSelect = $('operatorMaisonSelect');
        if (!maisonSelect) return;
        
        maisonSelect.innerHTML = '<option value="">-- Select Maison --</option>';
        MAISONS.forEach(m => {
            const option = document.createElement('option');
            option.value = m.name;
            option.textContent = m.shortName;
            maisonSelect.appendChild(option);
        });
    };

    const renderOperatorDataTable = async () => {
        const maisonSelect = $('operatorMaisonSelect');
        const yearSelect = $('operatorYearSelect');
        const tbody = $('operatorDataTableBody');
        
        if (!maisonSelect || !yearSelect || !tbody) return;
        
        const selectedMaison = maisonSelect.value;
        const selectedYear = parseInt(yearSelect.value);
        
        if (!selectedMaison) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Please select a Maison to view and record data</td></tr>';
            return;
        }
        
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading...</td></tr>';
        
        const months = getFiscalYearMonths(selectedYear);
        const res = await api('getActualDataByMaison', { maisonName: selectedMaison, year: selectedYear });
        
        // Build data map
        const dataMap = {};
        if (res.success && res.data) {
            res.data.forEach(record => {
                const formattedMonth = String(record.Month).padStart(2, '0');
                const key = `${record.Year}-${formattedMonth}`;
                dataMap[key] = record;
            });
        }
        
        let html = '';
        months.forEach(({ year, month }) => {
            const key = formatMonth(year, month);
            const data = dataMap[key];
            
            const monthDisplay = `${year}-${month}`;
            
            const emailVal = data ? (parseInt(data.EmailUsage) || 0) : '-';
            const smsVal = data ? (parseInt(data.SMSUsage) || 0) : '-';
            const whatsappVal = data ? (parseInt(data.WhatsAppUsage) || 0) : '-';
            const contactsVal = data ? (parseInt(data.ContactsTotal) || 0) : '-';
            const recordedBy = data ? data.RecordedBy : '-';
            const timestamp = data ? fmt(data.Timestamp) : '-';
            
            const buttonText = data ? 'Update' : 'Submit';
            const buttonClass = data ? 'action-button-table update-button' : 'action-button-table';
            
            html += `
                <tr>
                    <td class="month-cell">${monthDisplay}</td>
                    <td>${emailVal}</td>
                    <td>${smsVal}</td>
                    <td>${whatsappVal}</td>
                    <td>${contactsVal}</td>
                    <td>${recordedBy}</td>
                    <td style="font-size: 0.85em;">${timestamp}</td>
                    <td>
                        <button class="${buttonClass} operator-action-btn" 
                                data-maison="${selectedMaison}"
                                data-year="${year}" 
                                data-month="${month}"
                                data-has-data="${data ? 'true' : 'false'}">
                            ${buttonText}
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    };

    const openOperatorModal = async (maison, year, month, existingData = null) => {
        const modal = $('operatorModal');
        const modalTitle = $('operatorModalTitle');
        
        $('operatorModalMaison').value = maison;
        $('operatorModalYear').value = year;
        $('operatorModalMonth').value = month;
        
        const maisonShortName = MAISONS.find(m => m.name === maison)?.shortName || maison;
        modalTitle.textContent = `${existingData ? 'Update' : 'Record'} Actual Usage - ${maisonShortName} - ${formatMonth(year, month)}`;
        
        // If updating, fetch existing data
        if (existingData) {
            const res = await api('getActualDataByMaison', { maisonName: maison, year: year });
            if (res.success && res.data) {
                const record = res.data.find(r => r.Year == year && String(r.Month).padStart(2, '0') === month);
                if (record) {
                    $('operatorEmailInput').value = record.EmailUsage || '';
                    $('operatorSmsInput').value = record.SMSUsage || '';
                    $('operatorWhatsappInput').value = record.WhatsAppUsage || '';
                    $('operatorContactsInput').value = record.ContactsTotal || '';
                    $('operatorNotesInput').value = record.Notes || '';
                    
                    const notesLength = $('operatorNotesInput').value.length;
                    $('operatorNotesCharCount').textContent = `${notesLength}/200`;
                }
            }
        } else {
            $('operatorEmailInput').value = '';
            $('operatorSmsInput').value = '';
            $('operatorWhatsappInput').value = '';
            $('operatorContactsInput').value = '';
            $('operatorNotesInput').value = '';
            $('operatorNotesCharCount').textContent = '0/200';
        }
        
        modal.classList.remove('hidden');
    };

    const closeOperatorModal = () => {
        const modal = $('operatorModal');
        modal.classList.add('hidden');
    };

    const handleOperatorSubmit = async () => {
        const maison = $('operatorModalMaison').value;
        const year = parseInt($('operatorModalYear').value);
        const month = $('operatorModalMonth').value;
        
        const emailUsage = $('operatorEmailInput').value.trim();
        const smsUsage = $('operatorSmsInput').value.trim();
        const whatsappUsage = $('operatorWhatsappInput').value.trim();
        const contactsTotal = $('operatorContactsInput').value.trim();
        const notes = $('operatorNotesInput').value.trim();
        
        if (!emailUsage || !smsUsage || !whatsappUsage || !contactsTotal) {
            alert('Please fill in all four metrics.');
            return;
        }
        
        const emailNum = parseInt(emailUsage);
        const smsNum = parseInt(smsUsage);
        const whatsappNum = parseInt(whatsappUsage);
        const contactsNum = parseInt(contactsTotal);
        
        if (emailNum < 0 || smsNum < 0 || whatsappNum < 0 || contactsNum < 0) {
            alert('Values cannot be negative!');
            return;
        }
        
        let confirmMsg = `You are about to record the following actual usage:\n\n`;
        confirmMsg += `Maison: ${MAISONS.find(m => m.name === maison)?.shortName || maison}\n`;
        confirmMsg += `Period: ${year}-${month}\n`;
        confirmMsg += `Email Usage: ${emailNum}\n`;
        confirmMsg += `SMS Usage: ${smsNum}\n`;
        confirmMsg += `WhatsApp Usage: ${whatsappNum}\n`;
        confirmMsg += `Contacts Total: ${contactsNum}\n`;
        
        if (notes) {
            confirmMsg += `\nNotes: ${notes}\n`;
        }
        
        confirmMsg += '\nDo you want to proceed?';
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        const res = await api('submitActualData', {
            maisonName: maison,
            year: year,
            month: month,
            emailUsage: emailNum,
            smsUsage: smsNum,
            whatsappUsage: whatsappNum,
            contactsTotal: contactsNum,
            recordedBy: currentUser.username,
            notes: notes
        });
        
        if (res.success) {
            msg($('operatorMessage'), 'Actual data recorded successfully!', true);
            closeOperatorModal();
            renderOperatorDataTable();
            
            setTimeout(() => clr($('operatorMessage')), 3000);
        } else {
            alert('Failed to record data: ' + res.message);
        }
    };

    // ===== 表格配置和渲染 =====
    const baseHistoryHeaders = [
        { key: 'MaisonName', label: 'Maison Name' },
        { key: 'Year', label: 'Year' },
        { key: 'Month', label: 'Month' },
        { key: 'EmailCount', label: 'Email' },
        { key: 'SMSCount', label: 'SMS' },
        { key: 'WhatsAppCount', label: 'WhatsApp' },
        { key: 'ContactsCount', label: 'Contacts' },
        { key: 'SubmittedBy', label: 'Submitted By' },
        { key: 'Timestamp', label: 'Submission Time' },
        { key: 'ApprovalStatus', label: 'Approval Status' },
        { key: 'Action', label: 'Action Type' },
        { key: 'ActionTimestamp', label: 'Action Time' },
        { key: 'ActionBy', label: 'Action By' }
    ];

    const configs = {
        maisonHistory: {
            action: 'getMaisonSfmcHistory',
            headers: [...baseHistoryHeaders, { key: 'MaisonNotes', label: 'Notes' }],
            renderStatusBadge: false,
            actionColumn: null
        },
        adminHistory: {
            action: 'getAllSfmcHistory',
            headers: [...baseHistoryHeaders, { key: 'MaisonNotes', label: 'Maison Notes' }, { key: 'AdminNotes', label: 'Admin Notes' }],
            renderStatusBadge: false,
            actionColumn: null
        }
    };

    const loadTable = async (type, container, params = {}) => {
        const cfg = configs[type];
        if (!cfg) {
            console.error('Invalid table configuration type:', type);
            container.innerHTML = '<p class="error-text">Invalid table configuration.</p>';
            return;
        }

        const res = await api(cfg.action, params);

        if (!res.success || !res.data || !res.data.length) {
            container.innerHTML = `<p>${res.data && res.data.length === 0 ? 'No data available.' : 'Failed to load data: ' + (res.message || 'Unknown error')}</p>`;
            return;
        }

        let html = '<table><thead><tr>' + cfg.headers.map(h => `<th>${h.label}</th>`).join('');
        html += '</tr></thead><tbody>';

        res.data.forEach(row => {
            html += '<tr>' + cfg.headers.map(h => {
                let v = row[h.key];
                
                if (h.key === 'Timestamp' || h.key === 'ActionTimestamp') v = fmt(v);
                
                if (h.key === 'ApprovalStatus') {
                    v = v ?? '';
                }
                
                if ((h.key === 'MaisonNotes' || h.key === 'AdminNotes') && v && v.length > 50) {
                    v = `<span title="${v}">${v.substring(0, 50)}...</span>`;
                }
                
                return `<td>${v ?? ''}</td>`;
            }).join('');

            html += '</tr>';
        });

        container.innerHTML = html + '</tbody></table>';
    };

    // ===== Email Management =====
    const setEmailUI = (has, email = '') => {
        $('registeredEmailValue').textContent = email;
        $('emailDisplay').classList.toggle('hidden', !has);
        $('emailForm').classList.toggle('hidden', has);
        $('editEmailButton').classList.toggle('hidden', !has);
        $('cancelEditEmailButton').classList.add('hidden');
        $('submitEmailButton').textContent = 'Register Email';
        $('userEmailInput').value = email;
    };

    const initEmail = async () => {
        if (!currentUser || currentUser.role !== 'maison') { 
            $('emailManagementSection').classList.add('hidden'); 
            return; 
        }
        $('emailManagementSection').classList.remove('hidden');
        clr($('emailMessage'));
        const res = await api('getUserEmail', { username: currentUser.username });
        setEmailUI(res.success && res.email, res.email || '');
    };

    // ===== Email Broadcast =====
    const filtered = () => {
        if (!searchTerm) return allUsers;
        const t = searchTerm.toLowerCase();
        return allUsers.filter(u => [(u.username || ''), (u.email || ''), (u.maisonName || '')].some(f => f.toLowerCase().includes(t)));
    };

    const selected = () => Array.from($('userListContainer').querySelectorAll('.user-checkbox:checked')).map(cb => cb.dataset.email).filter(e => e && valid(e));

    const renderU = () => {
        const f = filtered();
        if (!f.length) { 
            $('userListContainer').innerHTML = '<p class="no-users-text">No users found.</p>'; 
            return; 
        }
        $('userListContainer').innerHTML = f.map((u, i) => {
            const id = `user-${i}-${(u.email || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
            return `<div class="user-checkbox-item">
                <input type="checkbox" id="${id}" class="user-checkbox" data-email="${u.email || ''}" data-username="${u.username || ''}" ${u.email ? '' : 'disabled'}>
                <label for="${id}" class="user-checkbox-label">
                    <span class="user-name">${u.username || 'N/A'}</span>
                    <span class="user-email">${u.email || 'No email'}</span>
                    ${u.maisonName ? `<span class="user-maison">${u.maisonName}</span>` : ''}
                </label>
            </div>`;
        }).join('');
    };

    const updCnt = () => {
        const cnt = selected().length;
        $('recipientCountDisplay').textContent = cnt > 0 ? `Selected: ${cnt} recipient(s)` : 'No recipients selected.';
        $('recipientCountDisplay').style.color = cnt > 0 ? '#00796b' : '#999';
        $('recipientCountDisplay').classList.remove('hidden');
    };

    $('userListContainer').addEventListener('change', e => { 
        if (e.target.classList.contains('user-checkbox')) updCnt(); 
    });

    const initBcast = async () => {
        if (!currentUser || currentUser.role !== 'admin') { 
            $('emailBroadcastSection').classList.add('hidden'); 
            return; 
        }
        $('emailBroadcastSection').classList.remove('hidden');
        $('userListContainer').innerHTML = '<p class="loading-text">Loading users...</p>';
        const res = await api('getAllUsers');
        if (res.success && res.data) { 
            allUsers = res.data.filter(u => u.email && u.email.trim()); 
            renderU(); 
            updCnt(); 
        } else {
            $('userListContainer').innerHTML = `<p class="error-text">Failed to load users: ${res.message || 'Unknown'}</p>`;
        }
    };
    // ===== Approval Modal for Admin =====
    let currentApprovalRecordId = null;
    let currentApprovalData = null;

    const openApprovalModal = async (recordId) => {
        // Find the record data
        const allDataRes = await api('getAllSfmcData');
        if (!allDataRes.success || !allDataRes.data) {
            alert('Failed to load record data');
            return;
        }
        
        const record = allDataRes.data.find(r => r.RecordId === recordId);
        if (!record) {
            alert('Record not found');
            return;
        }
        
        currentApprovalRecordId = recordId;
        currentApprovalData = record;
        
        const modal = $('approvalModal');
        
        $('approvalRecordId').value = recordId;
        $('approvalMaison').textContent = getMaisonShortName(record.MaisonName);
        $('approvalPeriod').textContent = `FY${record.Year} - ${getMonthName(String(record.Month).padStart(2, '0'))} (${record.Year}-${String(record.Month).padStart(2, '0')})`;
        $('approvalSubmittedBy').textContent = record.SubmittedBy || 'N/A';
        $('approvalTimestamp').textContent = fmt(record.Timestamp);
        
        $('approvalEmail').textContent = record.EmailCount || 0;
        $('approvalSms').textContent = record.SMSCount || 0;
        $('approvalWhatsapp').textContent = record.WhatsAppCount || 0;
        $('approvalContacts').textContent = record.ContactsCount || 0;
        
        if (record.MaisonNotes && record.MaisonNotes.trim()) {
            $('approvalMaisonNotesSection').classList.remove('hidden');
            $('approvalMaisonNotes').textContent = record.MaisonNotes;
        } else {
            $('approvalMaisonNotesSection').classList.add('hidden');
        }
        
        $('approvalAdminNotes').value = '';
        
        modal.classList.remove('hidden');
    };

    const closeApprovalModal = () => {
        const modal = $('approvalModal');
        modal.classList.add('hidden');
        currentApprovalRecordId = null;
        currentApprovalData = null;
    };

    const handleApprovalAction = async (action) => {
        if (!currentApprovalRecordId || !currentApprovalData) {
            alert('No record selected');
            return;
        }
        
        const adminNotes = $('approvalAdminNotes').value.trim();
        const status = action === 'approve' ? 'Approved' : 'Rejected';
        
        if (!confirm(`Are you sure you want to ${action} this submission?`)) {
            return;
        }
        
        const res = await api('updateApprovalStatus', {
            recordId: currentApprovalRecordId,
            newStatus: status,
            actionBy: currentUser.username,
            adminNotes: adminNotes
        });
        
        if (res.success) {
            alert(`Submission ${status.toLowerCase()} successfully!`);
            closeApprovalModal();
            
            // Refresh forecast table
            loadAdminForecast();
            
            // Refresh history
            loadTable('adminHistory', $('adminHistoryTableContainer'));
            
            // Send notification email (prepare)
            if (currentApprovalData.SubmittedBy) {
                sendApprovalNotification(
                    currentApprovalData.SubmittedBy,
                    status,
                    currentApprovalData.MaisonName,
                    currentApprovalData.Year,
                    currentApprovalData.Month,
                    `Email: ${currentApprovalData.EmailCount}, SMS: ${currentApprovalData.SMSCount}, WhatsApp: ${currentApprovalData.WhatsAppCount}, Contacts: ${currentApprovalData.ContactsCount}`,
                    currentApprovalData.Timestamp,
                    currentApprovalData.MaisonNotes || '',
                    adminNotes
                );
            }
        } else {
            alert('Failed to update approval status: ' + res.message);
        }
    };

    const buildNotificationBody = (submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes) => {
        const statusText = status === 'Approved' ? 'Approved' : 'Rejected';
        const formattedTimestamp = timestamp ? fmt(timestamp) : (timestamp || '');
        return (
            `Dear ${submittedBy},\n\n` +
            `Your SFMC data submission has been ${statusText.toLowerCase()}.\n\n` +
            `Details:\n` +
            `Maison Name: ${maisonName || ''}\n` +
            `Year-Month: ${year || ''}-${String(month).padStart(2, '0')}\n` +
            `Data: ${dataDetails || ''}\n` +
            `Submitted By: ${submittedBy || ''}\n` +
            `Submission Time: ${formattedTimestamp}\n` +
            `Approval Status: ${statusText}\n` +
            (maisonNotes ? `\nYour Notes: ${maisonNotes}\n` : '') +
            (adminNotes ? `\nAdmin Notes: ${adminNotes}\n` : '') +
            `\n` +
            (status === 'Approved' 
              ? `Thank you for your submission. The data has been successfully approved.\n`
              : `Please review your submission. If you have any questions or need to resubmit, please contact the administrator.\n`) +
            `\nBest regards,\nBT-admin`
        );
    };

    const sendApprovalNotification = async (submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes) => {
        try {
            const emailRes = await api('getUserEmail', { username: submittedBy });
            if (!emailRes.success || !emailRes.email) {
                msg($('emailBroadcastMessage'), `User "${submittedBy}" has no registered email. Notification not prepared.`, false);
                return;
            }
            const applicantEmail = emailRes.email.trim();
            const statusText = status === 'Approved' ? 'Approved' : 'Rejected';
            const maisonShortName = getMaisonShortName(maisonName);
            const subject = `SFMC Data Submission ${statusText} - ${maisonShortName} (${year}-${String(month).padStart(2, '0')})`;
            const body = buildNotificationBody(submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes);

            $('emailSubjectInput').value = subject;
            $('emailContentInput').value = body;

            if (!allUsers || !allUsers.length) {
                const res = await api('getAllUsers');
                if (res.success && res.data) allUsers = res.data.filter(u => u.email && u.email.trim());
            }
            
            const hasApplicant = allUsers && allUsers.some(u => (u.username || '').trim() === submittedBy);
            if (!hasApplicant && allUsers) {
                allUsers = [...allUsers, { username: submittedBy, email: applicantEmail, maisonName: '', role: '' }];
            }
            if (allUsers && allUsers.length) {
                searchTerm = '';
                if ($('userSearchInput')) $('userSearchInput').value = '';
                renderU();
                
                $('userListContainer').querySelectorAll('.user-checkbox').forEach(cb => { 
                    cb.checked = (cb.dataset.username || '').trim() === submittedBy; 
                });
                updCnt();
            }

            // Scroll to email broadcast section
            $('emailBroadcastSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
            msg($('emailBroadcastMessage'), 'Notification email prepared. Click "Open in Outlook" to send.', true);
        } catch (error) {
            console.error('Error preparing approval notification:', error);
            msg($('emailBroadcastMessage'), 'Failed to prepare notification: ' + (error.message || 'Unknown error'), false);
        }
    };

    // ===== 导出功能 =====
    const exportHistoryData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        const res = await api('getAllSfmcHistory');
        if (!res.success || !res.data || !res.data.length) { 
            msg($('loginMessage'), 'Export failed: No history data available.', false); 
            return; 
        }
        
        const h = configs.adminHistory.headers;
        let csv = h.map(x => x.label).join(',') + '\n';
        
        res.data.forEach(r => { 
            csv += h.map(x => { 
                let v = r[x.key]; 
                if (x.key === 'Timestamp' || x.key === 'ActionTimestamp') v = fmt(v);
                return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? ''); 
            }).join(',') + '\n'; 
        });
        
        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b);
        l.download = `SFMC_History_Export_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l);
        l.click();
        document.body.removeChild(l);
        
        msg($('loginMessage'), 'History data exported successfully!', true);
        setTimeout(() => clr($('loginMessage')), 3000);
    };

    // ===== 事件处理器 =====
    const handlers = {
        loginButton: async () => {
            const u = $('username').value.trim(), p = $('password').value.trim();
            if (!u || !p) { msg($('loginMessage'), 'Enter credentials!', false); return; }
            const res = await api('login', { username: u, password: p });
            if (!res.success) { msg($('loginMessage'), 'Login failed: ' + res.message, false); return; }
            msg($('loginMessage'), 'Login successful!', true);
            currentUser = { username: u, role: res.role, maisonName: res.maisonName };
            
            const cfg = await api('getConfig');
            if (cfg.success && cfg.data) {
                Object.assign(configPrices, { 
                    BeautyTechEmail: cfg.data.BeautyTechEmail || 'zzhou@pcis.lvmh-pc.com',
                    VarianceThreshold: parseFloat(cfg.data.VarianceThreshold) || 15
                });
            }
            
            setTimeout(async () => {
                showPage($('mainPage'));
                $('welcomeMessage').textContent = `Welcome, ${currentUser.username} (${currentUser.role})!`;
                
                if (currentUser.role === 'maison') {
                    $('maisonView').classList.remove('hidden'); 
                    $('adminView').classList.add('hidden');
                    $('operatorView').classList.add('hidden');
                    
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1;
                    currentFiscalYear = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
                    
                    renderMonthlyDataTable();
                    loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
                    initEmail();
                    clr($('monthlyDataMessage'));
                } else if (currentUser.role === 'admin') {
                    $('adminView').classList.remove('hidden'); 
                    $('maisonView').classList.add('hidden');
                    $('operatorView').classList.add('hidden');
                    
                    // 初始化 Admin 全局状态
                    adminGlobalYear = currentYear;
                    adminBudgetMaison = 'ACQUA DI PARMA SRL';
                    adminForecastMaison = 'ACQUA DI PARMA SRL';
                    adminActualMaison = 'ACQUA DI PARMA SRL';
                    
                    // 加载初始数据
                    loadAdminBudget();
                    loadAdminForecast();
                    loadAdminActual();
                    initBcast();
                    loadTable('adminHistory', $('adminHistoryTableContainer'));
                } else if (currentUser.role === 'sfmc-operator') {
                    $('operatorView').classList.remove('hidden');
                    $('maisonView').classList.add('hidden');
                    $('adminView').classList.add('hidden');
                    
                    initOperatorView();
                }
            }, 500);
        },

        logoutButton: () => {
            currentUser = null;
            $('username').value = $('password').value = '';
            clr($('loginMessage')); 
            clr($('monthlyDataMessage')); 
            clr($('emailMessage')); 
            clr($('emailBroadcastMessage'));
            showPage($('loginPage'));
        },

        adminLogoutButton: () => handlers.logoutButton(),
        operatorLogoutButton: () => handlers.logoutButton(),

        submitEmailButton: async () => {
            if (!currentUser || currentUser.role !== 'maison') { 
                msg($('emailMessage'), 'Maison only.', false); 
                return; 
            }
            const e = $('userEmailInput').value.trim();
            if (!e) { msg($('emailMessage'), 'Email address cannot be empty!', false); return; }
            if (!valid(e)) { msg($('emailMessage'), 'Invalid email format!', false); return; }
            msg($('emailMessage'), 'Saving email...', true);
            const res = await api('updateUserEmail', { username: currentUser.username, email: e });
            msg($('emailMessage'), res.success ? 'Email saved successfully!' : 'Failed to save email: ' + res.message, res.success);
            if (res.success) initEmail();
        },

        editEmailButton: () => {
            $('emailDisplay').classList.add('hidden'); 
            $('editEmailButton').classList.add('hidden');
            $('emailForm').classList.remove('hidden'); 
            $('userEmailInput').value = $('registeredEmailValue').textContent;
            $('submitEmailButton').textContent = 'Save Changes'; 
            $('cancelEditEmailButton').classList.remove('hidden');
            clr($('emailMessage'));
        },

        cancelEditEmailButton: () => { 
            initEmail(); 
            clr($('emailMessage')); 
        },

        selectAllButton: () => { 
            $('userListContainer').querySelectorAll('.user-checkbox:not(:disabled)').forEach(c => c.checked = true); 
            updCnt(); 
        },

        deselectAllButton: () => { 
            $('userListContainer').querySelectorAll('.user-checkbox').forEach(c => c.checked = false); 
            updCnt(); 
        },

        openOutlookButton: async () => {
            const em = selected();
            if (!em.length) { 
                msg($('emailBroadcastMessage'), 'No recipients selected to send email.', false); 
                return; 
            }
            const s = encodeURIComponent($('emailSubjectInput').value.trim()), 
                  b = encodeURIComponent($('emailContentInput').value.trim());
            const p = [s && `subject=${s}`, b && `body=${b}`].filter(Boolean);
            const mailtoLink = `mailto:${em.join(';')}${p.length ? '?' + p.join('&') : ''}`;

            const tempLink = document.createElement('a');
            tempLink.href = mailtoLink;
            tempLink.style.display = 'none';
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);
            
            msg($('emailBroadcastMessage'), `Opening Outlook with ${em.length} recipient(s)...`, true);
        },

        copyEmailsButton: () => {
            const em = selected();
            if (!em.length) { 
                msg($('emailBroadcastMessage'), 'No recipients selected to copy emails.', false); 
                return; 
            }
            const list = em.join('; ');
            navigator.clipboard.writeText(list).then(() => 
                msg($('emailBroadcastMessage'), `Copied ${em.length} email(s) to clipboard!`, true)
            ).catch(() => {
                const t = document.createElement('textarea'); 
                t.value = list; 
                t.style.position = 'fixed'; 
                t.style.left = '-9999px';
                document.body.appendChild(t); 
                t.select();
                try { 
                    document.execCommand('copy'); 
                    msg($('emailBroadcastMessage'), `Copied ${em.length} email(s) to clipboard (fallback)!`, true); 
                } catch (err) { 
                    msg($('emailBroadcastMessage'), 'Copy failed. Please manually copy the emails.', false); 
                    console.error('Fallback copy failed:', err);
                }
                document.body.removeChild(t);
            });
        },

        exportHistoryDataButton: exportHistoryData
    };

    // 统一绑定事件
    Object.keys(handlers).forEach(id => {
        const element = $(id);
        if (element) {
            element.addEventListener('click', handlers[id]);
        }
    });
    // === Maison View Event Listeners ===

    // Fiscal Year Tab buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('fy-tab-button')) {
            const fiscalYear = parseInt(e.target.dataset.year);
            switchFiscalYearTab(fiscalYear);
        }
    });

    // Notes link click handler
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('notes-link')) {
            const year = parseInt(e.target.dataset.year);
            const month = e.target.dataset.month;
            openNotesViewModal(year, month);
        }
    });

    // Action buttons in monthly data table
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('action-button-table') && !e.target.classList.contains('operator-action-btn')) {
            const year = parseInt(e.target.dataset.year);
            const month = e.target.dataset.month;
            const hasData = e.target.dataset.hasData === 'true';
            
            const key = formatMonth(year, month);
            const existingData = monthlyDataCache[currentFiscalYear]?.[key] || null;
            
            openModal(year, month, existingData);
        }
    });

    // Modal close button
    if ($('modalClose')) {
        $('modalClose').addEventListener('click', closeModal);
    }

    // Modal cancel button
    if ($('modalCancelButton')) {
        $('modalCancelButton').addEventListener('click', closeModal);
    }

    // Modal submit button
    if ($('modalSubmitButton')) {
        $('modalSubmitButton').addEventListener('click', handleModalSubmit);
    }

    // Close modal when clicking outside
    if ($('submissionModal')) {
        $('submissionModal').addEventListener('click', (e) => {
            if (e.target.id === 'submissionModal') {
                closeModal();
            }
        });
    }

    // Modal notes character count
    if ($('modalNotesInput')) {
        $('modalNotesInput').addEventListener('input', () => {
            const count = $('modalNotesInput').value.length;
            $('modalNotesCharCount').textContent = `${count}/200`;
            if (count >= 200) {
                $('modalNotesCharCount').style.color = '#d32f2f';
            } else {
                $('modalNotesCharCount').style.color = '#666';
            }
        });
    }

    // Notes View Modal close handlers
    if ($('notesViewClose')) {
        $('notesViewClose').addEventListener('click', closeNotesViewModal);
    }

    if ($('notesViewCloseButton')) {
        $('notesViewCloseButton').addEventListener('click', closeNotesViewModal);
    }

    // Close notes view modal when clicking outside
    if ($('notesViewModal')) {
        $('notesViewModal').addEventListener('click', (e) => {
            if (e.target.id === 'notesViewModal') {
                closeNotesViewModal();
            }
        });
    }

    // 搜索输入框事件
    const userSearchInput = $('userSearchInput');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', () => { 
            searchTerm = $('userSearchInput').value.trim(); 
            renderU(); 
            updCnt(); 
        });
    }

    // === Admin View Event Listeners ===

    // Global Year Tabs
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('global-year-tab')) {
            const year = parseInt(e.target.dataset.year);
            switchGlobalYear(year);
        }
    });

    // Budget Maison Selector
    if ($('adminBudgetMaison')) {
        $('adminBudgetMaison').addEventListener('change', (e) => {
            adminBudgetMaison = e.target.value;
            loadAdminBudget();
        });
    }

    // Submit Budget Button
    if ($('adminSubmitBudget')) {
        $('adminSubmitBudget').addEventListener('click', submitAdminBudget);
    }

    // Forecast Maison Tabs
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('maison-tab') && 
            e.target.closest('.forecast-section')) {
            // Update active state
            e.target.closest('.maison-tabs').querySelectorAll('.maison-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            e.target.classList.add('active');
            
            // Load new data
            adminForecastMaison = e.target.dataset.maison;
            loadAdminForecast();
        }
    });

    // Actual Maison Tabs
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('maison-tab') && 
            e.target.closest('.actual-section')) {
            // Update active state
            e.target.closest('.maison-tabs').querySelectorAll('.maison-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            e.target.classList.add('active');
            
            // Load new data
            adminActualMaison = e.target.dataset.maison;
            loadAdminActual();
        }
    });

    // Collapsible Headers
    if ($('emailBroadcastHeader')) {
        $('emailBroadcastHeader').addEventListener('click', () => {
            const content = $('emailBroadcastContent');
            content.classList.toggle('hidden');
            const header = $('emailBroadcastHeader').querySelector('h3');
            header.textContent = content.classList.contains('hidden') ? '▶ Email Broadcast' : '▼ Email Broadcast';
        });
    }

    if ($('historyLogHeader')) {
        $('historyLogHeader').addEventListener('click', () => {
            const content = $('historyLogContent');
            content.classList.toggle('hidden');
            const header = $('historyLogHeader').querySelector('h3');
            header.textContent = content.classList.contains('hidden') ? '▶ Historical Actions Log' : '▼ Historical Actions Log';
        });
    }

    // Approve/Reject buttons in forecast table
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('approve-button-table') || e.target.classList.contains('reject-button-table')) {
            const recordId = e.target.dataset.recordId;
            if (recordId) {
                openApprovalModal(recordId);
            }
        }
    });

    // Approval modal handlers
    if ($('approvalModalClose')) {
        $('approvalModalClose').addEventListener('click', closeApprovalModal);
    }

    if ($('approvalCancelButton')) {
        $('approvalCancelButton').addEventListener('click', closeApprovalModal);
    }

    if ($('approvalApproveButton')) {
        $('approvalApproveButton').addEventListener('click', () => handleApprovalAction('approve'));
    }

    if ($('approvalRejectButton')) {
        $('approvalRejectButton').addEventListener('click', () => handleApprovalAction('reject'));
    }

    if ($('approvalModal')) {
        $('approvalModal').addEventListener('click', (e) => {
            if (e.target.id === 'approvalModal') {
                closeApprovalModal();
            }
        });
    }

    // === SFMC Operator View Event Listeners ===

    // Maison select change
    if ($('operatorMaisonSelect')) {
        $('operatorMaisonSelect').addEventListener('change', renderOperatorDataTable);
    }

    // Year select change
    if ($('operatorYearSelect')) {
        $('operatorYearSelect').addEventListener('change', renderOperatorDataTable);
    }

    // Operator action buttons
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('operator-action-btn')) {
            const maison = e.target.dataset.maison;
            const year = parseInt(e.target.dataset.year);
            const month = e.target.dataset.month;
            const hasData = e.target.dataset.hasData === 'true';
            
            openOperatorModal(maison, year, month, hasData);
        }
    });

    // Operator modal close
    if ($('operatorModalClose')) {
        $('operatorModalClose').addEventListener('click', closeOperatorModal);
    }

    if ($('operatorModalCancelButton')) {
        $('operatorModalCancelButton').addEventListener('click', closeOperatorModal);
    }

    if ($('operatorModalSubmitButton')) {
        $('operatorModalSubmitButton').addEventListener('click', handleOperatorSubmit);
    }

    if ($('operatorModal')) {
        $('operatorModal').addEventListener('click', (e) => {
            if (e.target.id === 'operatorModal') {
                closeOperatorModal();
            }
        });
    }

    // Operator notes character count
    if ($('operatorNotesInput')) {
        $('operatorNotesInput').addEventListener('input', () => {
            const count = $('operatorNotesInput').value.length;
            $('operatorNotesCharCount').textContent = `${count}/200`;
            if (count >= 200) {
                $('operatorNotesCharCount').style.color = '#d32f2f';
            } else {
                $('operatorNotesCharCount').style.color = '#666';
            }
        });
    }

    // 初始化
    showPage($('loginPage'));
});
