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
    let currentAdminTab = 'overview';
    let currentAdminMaison = '';
    let currentAdminYear = 2026;
    let monthlyDataCache = {};

    // Maison 列表配置
    const MAISONS = [
        { name: 'ACQUA DI PARMA SRL', shortName: 'ADPS' },
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

    // Switch Admin Tab
    const switchAdminTab = (tabName) => {
        currentAdminTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.admin-tab-button').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        if (tabName === 'overview') {
            $('overviewTabContent').classList.add('active');
            renderOverviewTab();
        } else {
            // Render maison-specific tab
            currentAdminMaison = tabName;
            renderMaisonTab(tabName);
        }
    };

    // Render Overview Tab
    const renderOverviewTab = async () => {
        const year = parseInt($('overviewYearSelect').value) || currentYear;
        const container = $('overviewSummaryContainer');
        
        if (!container) return;
        
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
        
        // Fetch data
        const forecastRes = await api('getForecastData', { year: year });
        const budgetRes = await api('getAnnualBudgets', { year: year });
        const actualRes = await api('getActualData', { year: year });
        
        if (!forecastRes.success) {
            container.innerHTML = '<p>Failed to load forecast data.</p>';
            return;
        }
        
        // Build budget map
        const budgets = {};
        if (budgetRes.success && budgetRes.data) {
            budgetRes.data.forEach(b => {
                budgets[b.MaisonName] = {
                    email: parseInt(b.EmailBudget) || 0,
                    sms: parseInt(b.SMSBudget) || 0,
                    whatsapp: parseInt(b.WhatsAppBudget) || 0,
                    contacts: parseInt(b.ContactsBudget) || 0
                };
            });
        }
        
        // Build actual map
        const actuals = {};
        if (actualRes.success && actualRes.data) {
            actualRes.data.forEach(a => {
                if (!actuals[a.MaisonName]) {
                    actuals[a.MaisonName] = {
                        email: 0,
                        sms: 0,
                        whatsapp: 0,
                        contacts: 0
                    };
                }
                actuals[a.MaisonName].email += parseInt(a.EmailUsage) || 0;
                actuals[a.MaisonName].sms += parseInt(a.SMSUsage) || 0;
                actuals[a.MaisonName].whatsapp += parseInt(a.WhatsAppUsage) || 0;
                // Contacts is cumulative, take the latest
                const contactsTotal = parseInt(a.ContactsTotal) || 0;
                if (contactsTotal > actuals[a.MaisonName].contacts) {
                    actuals[a.MaisonName].contacts = contactsTotal;
                }
            });
        }
        
        // Build table
        let html = '<table class="overview-summary-table"><thead><tr>';
        html += '<th>Maison</th>';
        html += '<th>Email<br>Forecast / Budget</th>';
        html += '<th>SMS<br>Forecast / Budget</th>';
        html += '<th>WhatsApp<br>Forecast / Budget</th>';
        html += '<th>Contacts<br>Forecast / Budget</th>';
        html += '<th>Email<br>Actual</th>';
        html += '<th>SMS<br>Actual</th>';
        html += '<th>WhatsApp<br>Actual</th>';
        html += '<th>Contacts<br>Actual</th>';
        html += '</tr></thead><tbody>';
        
        let totalForecastEmail = 0, totalForecastSms = 0, totalForecastWhatsapp = 0, totalForecastContacts = 0;
        let totalBudgetEmail = 0, totalBudgetSms = 0, totalBudgetWhatsapp = 0, totalBudgetContacts = 0;
        let totalActualEmail = 0, totalActualSms = 0, totalActualWhatsapp = 0, totalActualContacts = 0;
        
        MAISONS.forEach(maison => {
            const forecast = forecastRes.data.find(f => f.MaisonName === maison.name) || { TotalEmail: 0, TotalSMS: 0, TotalWhatsApp: 0, TotalContacts: 0 };
            const budget = budgets[maison.name] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            const actual = actuals[maison.name] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            
            totalForecastEmail += forecast.TotalEmail;
            totalForecastSms += forecast.TotalSMS;
            totalForecastWhatsapp += forecast.TotalWhatsApp;
            totalForecastContacts += forecast.TotalContacts;
            
            totalBudgetEmail += budget.email;
            totalBudgetSms += budget.sms;
            totalBudgetWhatsapp += budget.whatsapp;
            totalBudgetContacts += budget.contacts;
            
            totalActualEmail += actual.email;
            totalActualSms += actual.sms;
            totalActualWhatsapp += actual.whatsapp;
            totalActualContacts += actual.contacts;
            
            const calcVariance = (f, b) => b > 0 ? ((f - b) / b * 100).toFixed(1) : '0.0';
            
            html += '<tr>';
            html += `<td class="maison-name-cell">${maison.shortName}</td>`;
            html += `<td>${forecast.TotalEmail} / ${budget.email}<br><span class="${getVarianceClass(calcVariance(forecast.TotalEmail, budget.email))}">(${calcVariance(forecast.TotalEmail, budget.email)}%)</span></td>`;
            html += `<td>${forecast.TotalSMS} / ${budget.sms}<br><span class="${getVarianceClass(calcVariance(forecast.TotalSMS, budget.sms))}">(${calcVariance(forecast.TotalSMS, budget.sms)}%)</span></td>`;
            html += `<td>${forecast.TotalWhatsApp} / ${budget.whatsapp}<br><span class="${getVarianceClass(calcVariance(forecast.TotalWhatsApp, budget.whatsapp))}">(${calcVariance(forecast.TotalWhatsApp, budget.whatsapp)}%)</span></td>`;
            html += `<td>${forecast.TotalContacts} / ${budget.contacts}<br><span class="${getVarianceClass(calcVariance(forecast.TotalContacts, budget.contacts))}">(${calcVariance(forecast.TotalContacts, budget.contacts)}%)</span></td>`;
            html += `<td>${actual.email}</td>`;
            html += `<td>${actual.sms}</td>`;
            html += `<td>${actual.whatsapp}</td>`;
            html += `<td>${actual.contacts}</td>`;
            html += '</tr>';
        });
        
        // Total row
        const calcVariance = (f, b) => b > 0 ? ((f - b) / b * 100).toFixed(1) : '0.0';
        
        html += '<tr class="total-row">';
        html += '<td class="maison-name-cell"><strong>Total</strong></td>';
        html += `<td><strong>${totalForecastEmail} / ${totalBudgetEmail}</strong><br><span class="${getVarianceClass(calcVariance(totalForecastEmail, totalBudgetEmail))}">(${calcVariance(totalForecastEmail, totalBudgetEmail)}%)</span></td>`;
        html += `<td><strong>${totalForecastSms} / ${totalBudgetSms}</strong><br><span class="${getVarianceClass(calcVariance(totalForecastSms, totalBudgetSms))}">(${calcVariance(totalForecastSms, totalBudgetSms)}%)</span></td>`;
        html += `<td><strong>${totalForecastWhatsapp} / ${totalBudgetWhatsapp}</strong><br><span class="${getVarianceClass(calcVariance(totalForecastWhatsapp, totalBudgetWhatsapp))}">(${calcVariance(totalForecastWhatsapp, totalBudgetWhatsapp)}%)</span></td>`;
        html += `<td><strong>${totalForecastContacts} / ${totalBudgetContacts}</strong><br><span class="${getVarianceClass(calcVariance(totalForecastContacts, totalBudgetContacts))}">(${calcVariance(totalForecastContacts, totalBudgetContacts)}%)</span></td>`;
        html += `<td><strong>${totalActualEmail}</strong></td>`;
        html += `<td><strong>${totalActualSms}</strong></td>`;
        html += `<td><strong>${totalActualWhatsapp}</strong></td>`;
        html += `<td><strong>${totalActualContacts}</strong></td>`;
        html += '</tr>';
        
        html += '</tbody></table>';
        
        container.innerHTML = html;
    };

    const getVarianceClass = (variance) => {
        const v = parseFloat(variance);
        if (Math.abs(v) <= 5) return 'variance-neutral';
        return v > 0 ? 'variance-positive' : 'variance-negative';
    };

    // Render Maison-specific Tab
    const renderMaisonTab = async (maisonName) => {
        // Find or create maison tab content
        let maisonContent = document.querySelector(`.admin-tab-content[data-maison="${maisonName}"]`);
        
        if (!maisonContent) {
            maisonContent = document.createElement('div');
            maisonContent.className = 'admin-tab-content';
            maisonContent.dataset.maison = maisonName;
            $('adminView').appendChild(maisonContent);
        }
        
        // Show this content
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        maisonContent.classList.add('active');
        
        // Get short name
        const maisonShortName = MAISONS.find(m => m.name === maisonName)?.shortName || maisonName;
        
        // Render content
        maisonContent.innerHTML = `
            <div class="maison-detail-section">
                <h3>${maisonShortName} - Management Dashboard</h3>
                
                <!-- Fiscal Year Selector -->
                <div class="year-selection-container">
                    <label for="maisonYearSelect_${maisonName}">Fiscal Year:</label>
                    <select id="maisonYearSelect_${maisonName}" class="form-control year-select maison-year-select" data-maison="${maisonName}">
                        <option value="2025">FY2025</option>
                        <option value="2026" selected>FY2026</option>
                        <option value="2027">FY2027</option>
                    </select>
                </div>
                
                <!-- Budget Section -->
                <div class="maison-budget-section">
                    <h4>Set Annual Budget for ${maisonShortName}</h4>
                    <div class="budget-inputs-row">
                        <div class="budget-input-group">
                            <label>Email Budget:</label>
                            <input type="number" id="budgetEmail_${maisonName}" class="form-control" min="0" value="0" placeholder="Enter budget">
                        </div>
                        <div class="budget-input-group">
                            <label>SMS Budget:</label>
                            <input type="number" id="budgetSms_${maisonName}" class="form-control" min="0" value="0" placeholder="Enter budget">
                        </div>
                        <div class="budget-input-group">
                            <label>WhatsApp Budget:</label>
                            <input type="number" id="budgetWhatsapp_${maisonName}" class="form-control" min="0" value="0" placeholder="Enter budget">
                        </div>
                        <div class="budget-input-group">
                            <label>Contacts Budget:</label>
                            <input type="number" id="budgetContacts_${maisonName}" class="form-control" min="0" value="0" placeholder="Enter budget">
                        </div>
                    </div>
                    <button class="submit-budget-btn" data-maison="${maisonName}">Submit Budget</button>
                    <p id="budgetMessage_${maisonName}" class="message"></p>
                </div>
                
                <!-- Forecast and Actual Tables -->
                <div class="forecast-actual-container">
                    <div class="forecast-table-wrapper">
                        <h4>Monthly Forecast (Submitted by Maison)</h4>
                        <div id="forecastTable_${maisonName}"></div>
                    </div>
                    
                    <div class="actual-table-wrapper">
                        <h4>Monthly Actual Usage (Recorded by SFMC Operator)</h4>
                        <div id="actualTable_${maisonName}"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Load data for this maison
        loadMaisonData(maisonName, currentAdminYear);
    };

    // Load Maison Data
    const loadMaisonData = async (maisonName, year) => {
        // Load budget
        const budgetRes = await api('getAnnualBudgetByMaison', { maisonName: maisonName, year: year });
        
        if (budgetRes.success && budgetRes.data) {
            const budget = budgetRes.data;
            const emailInput = $(`budgetEmail_${maisonName}`);
            const smsInput = $(`budgetSms_${maisonName}`);
            const whatsappInput = $(`budgetWhatsapp_${maisonName}`);
            const contactsInput = $(`budgetContacts_${maisonName}`);
            
            if (emailInput) emailInput.value = budget.EmailBudget || 0;
            if (smsInput) smsInput.value = budget.SMSBudget || 0;
            if (whatsappInput) whatsappInput.value = budget.WhatsAppBudget || 0;
            if (contactsInput) contactsInput.value = budget.ContactsBudget || 0;
        }
        
        // Load forecast data
        renderForecastTable(maisonName, year);
        
        // Load actual data
        renderActualTable(maisonName, year);
    };

    // Render Forecast Table for Maison
    const renderForecastTable = async (maisonName, year) => {
        const container = $(`forecastTable_${maisonName}`);
        if (!container) return;
        
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
        
        const res = await api('getSfmcDataByMaison', { maisonName: maisonName, year: year });
        const budgetRes = await api('getAnnualBudgetByMaison', { maisonName: maisonName, year: year });
        
        const months = getFiscalYearMonths(year);
        
        // Build data map
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
        
        // Build table
        let html = '<table class="forecast-actual-table"><thead><tr>';
        html += '<th>Month</th><th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th><th>Status</th><th>Action</th>';
        html += '</tr></thead><tbody>';
        
        let ytdEmail = 0, ytdSms = 0, ytdWhatsapp = 0, ytdContacts = 0;
        
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
                ytdEmail += parseInt(data.EmailCount) || 0;
                ytdSms += parseInt(data.SMSCount) || 0;
                ytdWhatsapp += parseInt(data.WhatsAppCount) || 0;
                ytdContacts += parseInt(data.ContactsCount) || 0;
            }
            
            let actionCell = '-';
            if (data && data.ApprovalStatus === 'Pending') {
                actionCell = `<button class="approve-button-table" data-record-id="${data.RecordId}" data-maison="${maisonName}">Approve</button>
                              <button class="reject-button-table" data-record-id="${data.RecordId}" data-maison="${maisonName}">Reject</button>`;
            }
            
            html += '<tr>';
            html += `<td class="month-cell">${monthDisplay}</td>`;
            html += `<td>${emailVal}</td>`;
            html += `<td>${smsVal}</td>`;
            html += `<td>${whatsappVal}</td>`;
            html += `<td>${contactsVal}</td>`;
            html += `<td><span class="${statusClass}"><span class="status-badge-cell">${status}</span></span></td>`;
            html += `<td>${actionCell}</td>`;
            html += '</tr>';
        });
        
        // Summary rows
        const remaining = {
            email: parseInt(budget.EmailBudget) - ytdEmail,
            sms: parseInt(budget.SMSBudget) - ytdSms,
            whatsapp: parseInt(budget.WhatsAppBudget) - ytdWhatsapp,
            contacts: parseInt(budget.ContactsBudget) - ytdContacts
        };
        
        const progress = {
            email: budget.EmailBudget > 0 ? (ytdEmail / budget.EmailBudget * 100).toFixed(1) : '0.0',
            sms: budget.SMSBudget > 0 ? (ytdSms / budget.SMSBudget * 100).toFixed(1) : '0.0',
            whatsapp: budget.WhatsAppBudget > 0 ? (ytdWhatsapp / budget.WhatsAppBudget * 100).toFixed(1) : '0.0',
            contacts: budget.ContactsBudget > 0 ? (ytdContacts / budget.ContactsBudget * 100).toFixed(1) : '0.0'
        };
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">YTD Approved</td>';
        html += `<td class="summary-value">${ytdEmail}</td>`;
        html += `<td class="summary-value">${ytdSms}</td>`;
        html += `<td class="summary-value">${ytdWhatsapp}</td>`;
        html += `<td class="summary-value">${ytdContacts}</td>`;
        html += '<td colspan="2"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Annual Budget</td>';
        html += `<td class="summary-value">${budget.EmailBudget}</td>`;
        html += `<td class="summary-value">${budget.SMSBudget}</td>`;
        html += `<td class="summary-value">${budget.WhatsAppBudget}</td>`;
        html += `<td class="summary-value">${budget.ContactsBudget}</td>`;
        html += '<td colspan="2"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Remaining</td>';
        html += `<td class="summary-value">${remaining.email}</td>`;
        html += `<td class="summary-value">${remaining.sms}</td>`;
        html += `<td class="summary-value">${remaining.whatsapp}</td>`;
        html += `<td class="summary-value">${remaining.contacts}</td>`;
        html += '<td colspan="2"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">Progress</td>';
        html += `<td class="summary-value">${progress.email}%</td>`;
        html += `<td class="summary-value">${progress.sms}%</td>`;
        html += `<td class="summary-value">${progress.whatsapp}%</td>`;
        html += `<td class="summary-value">${progress.contacts}%</td>`;
        html += '<td colspan="2"></td>';
        html += '</tr>';
        
        html += '</tbody></table>';
        
        container.innerHTML = html;
    };

    // Render Actual Table for Maison
    const renderActualTable = async (maisonName, year) => {
        const container = $(`actualTable_${maisonName}`);
        if (!container) return;
        
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
        
        const actualRes = await api('getActualDataByMaison', { maisonName: maisonName, year: year });
        const forecastRes = await api('getSfmcDataByMaison', { maisonName: maisonName, year: year });
        const budgetRes = await api('getAnnualBudgetByMaison', { maisonName: maisonName, year: year });
        
        const months = getFiscalYearMonths(year);
        
        // Build actual data map
        const actualMap = {};
        if (actualRes.success && actualRes.data) {
            actualRes.data.forEach(record => {
                const formattedMonth = String(record.Month).padStart(2, '0');
                const key = `${record.Year}-${formattedMonth}`;
                actualMap[key] = record;
            });
        }
        
        // Build forecast data map (only approved)
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
        
        // Build table
        let html = '<table class="forecast-actual-table"><thead><tr>';
        html += '<th>Month</th><th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th>';
        html += '<th>Variance vs Forecast</th><th>Recorded By</th><th>Time</th>';
        html += '</tr></thead><tbody>';
        
        let ytdActualEmail = 0, ytdActualSms = 0, ytdActualWhatsapp = 0, ytdActualContacts = 0;
        let ytdForecastEmail = 0, ytdForecastSms = 0, ytdForecastWhatsapp = 0, ytdForecastContacts = 0;
        
        months.forEach(({ year: y, month: m }) => {
            const key = formatMonth(y, m);
            const actual = actualMap[key];
            const forecast = forecastMap[key];
            
            const monthDisplay = `${y}-${m}`;
            
            const emailActual = actual ? (parseInt(actual.EmailUsage) || 0) : '-';
            const smsActual = actual ? (parseInt(actual.SMSUsage) || 0) : '-';
            const whatsappActual = actual ? (parseInt(actual.WhatsAppUsage) || 0) : '-';
            const contactsActual = actual ? (parseInt(actual.ContactsTotal) || 0) : '-';
            
            // Calculate cumulative forecast for contacts
            if (forecast) {
                ytdForecastEmail += parseInt(forecast.EmailCount) || 0;
                ytdForecastSms += parseInt(forecast.SMSCount) || 0;
                ytdForecastWhatsapp += parseInt(forecast.WhatsAppCount) || 0;
                ytdForecastContacts += parseInt(forecast.ContactsCount) || 0;
            }
            
            // Accumulate actual
            if (actual) {
                ytdActualEmail += parseInt(actual.EmailUsage) || 0;
                ytdActualSms += parseInt(actual.SMSUsage) || 0;
                ytdActualWhatsapp += parseInt(actual.WhatsAppUsage) || 0;
                // Contacts is cumulative, so take the latest value
                ytdActualContacts = parseInt(actual.ContactsTotal) || 0;
            }
            
            // Calculate variance
            let varianceText = '-';
            if (actual && forecast) {
                const varEmail = calcVariancePercent(parseInt(actual.EmailUsage) || 0, parseInt(forecast.EmailCount) || 0);
                const varSms = calcVariancePercent(parseInt(actual.SMSUsage) || 0, parseInt(forecast.SMSCount) || 0);
                const varWhatsapp = calcVariancePercent(parseInt(actual.WhatsAppUsage) || 0, parseInt(forecast.WhatsAppCount) || 0);
                // For contacts, compare cumulative values
                const varContacts = calcVariancePercent(parseInt(actual.ContactsTotal) || 0, ytdForecastContacts);
                
                varianceText = `E: ${varEmail}% / S: ${varSms}% / W: ${varWhatsapp}% / C: ${varContacts}%`;
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
        
        // Summary rows
        const varianceVsForecast = {
            email: calcVariancePercent(ytdActualEmail, ytdForecastEmail),
            sms: calcVariancePercent(ytdActualSms, ytdForecastSms),
            whatsapp: calcVariancePercent(ytdActualWhatsapp, ytdForecastWhatsapp),
            contacts: calcVariancePercent(ytdActualContacts, ytdForecastContacts)
        };
        
        const remaining = {
            email: parseInt(budget.EmailBudget) - ytdActualEmail,
            sms: parseInt(budget.SMSBudget) - ytdActualSms,
            whatsapp: parseInt(budget.WhatsAppBudget) - ytdActualWhatsapp,
            contacts: parseInt(budget.ContactsBudget) - ytdActualContacts
        };
        
        const utilization = {
            email: budget.EmailBudget > 0 ? (ytdActualEmail / budget.EmailBudget * 100).toFixed(1) : '0.0',
            sms: budget.SMSBudget > 0 ? (ytdActualSms / budget.SMSBudget * 100).toFixed(1) : '0.0',
            whatsapp: budget.WhatsAppBudget > 0 ? (ytdActualWhatsapp / budget.WhatsAppBudget * 100).toFixed(1) : '0.0',
            contacts: budget.ContactsBudget > 0 ? (ytdActualContacts / budget.ContactsBudget * 100).toFixed(1) : '0.0'
        };
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">YTD Actual</td>';
        html += `<td class="summary-value">${ytdActualEmail}</td>`;
        html += `<td class="summary-value">${ytdActualSms}</td>`;
        html += `<td class="summary-value">${ytdActualWhatsapp}</td>`;
        html += `<td class="summary-value">${ytdActualContacts}</td>`;
        html += '<td colspan="3"></td>';
        html += '</tr>';
        
        html += '<tr class="summary-row">';
        html += '<td class="summary-label">YTD Forecast</td>';
        html += `<td class="summary-value">${ytdForecastEmail}</td>`;
        html += `<td class="summary-value">${ytdForecastSms}</td>`;
        html += `<td class="summary-value">${ytdForecastWhatsapp}</td>`;
        html += `<td class="summary-value">${ytdForecastContacts}</td>`;
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
        $('approvalMaison').textContent = MAISONS.find(m => m.name === record.MaisonName)?.shortName || record.MaisonName;
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
            
            // Refresh the current maison tab
            if (currentAdminTab !== 'overview') {
                loadMaisonData(currentAdminTab, currentAdminYear);
            }
            
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
            const maisonShortName = MAISONS.find(m => m.name === maisonName)?.shortName || maisonName;
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

            // Switch to overview tab to show email broadcast
            switchAdminTab('overview');
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
                    
                    currentAdminYear = currentYear;
                    switchAdminTab('overview');
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

        exportHistoryDataButton: exportHistoryData,

        overviewYearSelect: () => {
            renderOverviewTab();
        }
    };

    // 统一绑定事件
    Object.keys(handlers).forEach(id => {
        const element = $(id);
        if (element) {
            element.addEventListener('click', handlers[id]);
        } else if (id === 'overviewYearSelect') {
            // Year select is a change event
            const el = $(id);
            if (el) el.addEventListener('change', handlers[id]);
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

    // Admin tab switching
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('admin-tab-button')) {
            const tabName = e.target.dataset.tab;
            switchAdminTab(tabName);
        }
    });

    // Maison year select (dynamically created)
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('maison-year-select')) {
            const maison = e.target.dataset.maison;
            const year = parseInt(e.target.value);
            currentAdminYear = year;
            loadMaisonData(maison, year);
        }
    });

    // Submit budget button (dynamically created)
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('submit-budget-btn')) {
            const maison = e.target.dataset.maison;
            const year = currentAdminYear;
            
            const emailBudget = parseInt($(`budgetEmail_${maison}`).value) || 0;
            const smsBudget = parseInt($(`budgetSms_${maison}`).value) || 0;
            const whatsappBudget = parseInt($(`budgetWhatsapp_${maison}`).value) || 0;
            const contactsBudget = parseInt($(`budgetContacts_${maison}`).value) || 0;
            
            if (emailBudget < 0 || smsBudget < 0 || whatsappBudget < 0 || contactsBudget < 0) {
                const msgEl = $(`budgetMessage_${maison}`);
                msg(msgEl, 'Budgets cannot be negative!', false);
                return;
            }
            
            const res = await api('setAnnualBudget', {
                maisonName: maison,
                year: year,
                emailBudget: emailBudget,
                smsBudget: smsBudget,
                whatsappBudget: whatsappBudget,
                contactsBudget: contactsBudget,
                updatedBy: currentUser.username
            });
            
            const msgEl = $(`budgetMessage_${maison}`);
            msg(msgEl, res.success ? 'Budget set successfully!' : 'Failed: ' + res.message, res.success);
            
            if (res.success) {
                setTimeout(() => clr(msgEl), 3000);
                loadMaisonData(maison, year);
                renderOverviewTab();
            }
        }
    });

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

