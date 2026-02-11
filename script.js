document.addEventListener('DOMContentLoaded', () => {
    // 替换为您的 Apps Script Web App URL
    const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7Kk7Fl01-gHgS-cAQYAqIzqhUOVb2HO9liK4FNbXZTacYTwqtDy784-sezU--2xPn/exec';

    const $ = id => document.getElementById(id);
    
    let currentUser = null;
    let configPrices = { BeautyTechEmail: 'zzhou@pcis.lvmh-pc.com', VarianceThreshold: 15 };
    let allUsers = [];
    let searchTerm = '';
    let currentYear = new Date().getFullYear();
    let currentFiscalYear = 2026; // Default to FY2026
    let monthlyDataCache = {}; // Cache for monthly data

    // ===== 工具函数 =====
    const showPage = page => {
        document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        page.classList.remove('hidden');
        page.classList.add('active');
    };

    const msg = (el, text, ok = false) => {
        el.textContent = text;
        el.className = ok ? 'message success' : 'message';
    };

    const clr = el => { el.textContent = ''; el.className = 'message'; };
    
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
// === Modal Control Functions ===
const openModal = (year, month, existingData = null) => {
    const modal = $('submissionModal');
    const modalTitle = $('modalTitle');
    
    $('modalYear').value = year;
    $('modalMonth').value = month;
    
    modalTitle.textContent = `${existingData ? 'Update' : 'Submit'} Data for ${formatMonth(year, month)}`;
    
    // Populate form with existing data or clear
    $('modalEmailInput').value = existingData ? existingData.EmailCount : '';
    $('modalSmsInput').value = existingData ? existingData.SMSCount : '';
    $('modalWhatsappInput').value = existingData ? existingData.WhatsAppCount : '';
    $('modalContactsInput').value = existingData ? existingData.ContactsCount : '';
    $('modalNotesInput').value = existingData ? (existingData.MaisonNotes || '') : '';
    
    // Update character count
    const notesLength = $('modalNotesInput').value.length;
    $('modalNotesCharCount').textContent = `${notesLength}/200`;
    
    // Show admin notes if rejected
    if (existingData && existingData.ApprovalStatus === 'Rejected' && existingData.AdminNotes) {
        $('modalAdminNotesSection').classList.remove('hidden');
        $('modalAdminNotesDisplay').textContent = existingData.AdminNotes;
    } else {
        $('modalAdminNotesSection').classList.add('hidden');
    }
    
    // Update submit button text
    $('modalSubmitButton').textContent = existingData ? 'Update' : 'Submit';
    
    modal.classList.remove('hidden');
};

const closeModal = () => {
    const modal = $('submissionModal');
    modal.classList.add('hidden');
    
    // Clear form
    $('modalEmailInput').value = '';
    $('modalSmsInput').value = '';
    $('modalWhatsappInput').value = '';
    $('modalContactsInput').value = '';
    $('modalNotesInput').value = '';
    $('modalNotesCharCount').textContent = '0/200';
    $('modalAdminNotesSection').classList.add('hidden');
};
// === Render Monthly Data Table ===
const renderMonthlyDataTable = async () => {
    const tbody = $('monthlyDataTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading...</td></tr>';
    
    const months = getFiscalYearMonths(currentFiscalYear);
    
    // Fetch existing data for this fiscal year
    const res = await api('getMaisonSfmcData', { submittedBy: currentUser.username });
    
    // Build data map for quick lookup
    const dataMap = {};
    if (res.success && res.data) {
        res.data.forEach(record => {
            const key = `${record.Year}-${record.Month}`;
            dataMap[key] = record;
        });
    }
    
    // Render table rows
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
        
        // Status cell with info icon for rejected items
        let statusCell = `<span class="status-cell ${statusClass}">${status}</span>`;
        if (status === 'Rejected' && existingData.AdminNotes) {
            statusCell += ` <span class="status-info-icon" title="${existingData.AdminNotes}">ⓘ</span>`;
        }
        
        html += `
            <tr data-year="${year}" data-month="${month}">
                <td class="month-cell">${monthDisplay}</td>
                <td><input type="number" class="month-input" data-field="email" value="${emailVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="sms" value="${smsVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="whatsapp" value="${whatsappVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="contacts" value="${contactsVal}" min="0" readonly></td>
                <td>${statusCell}</td>
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
    
    tbody.innerHTML = html;
    
    // Cache the data
    monthlyDataCache[currentFiscalYear] = dataMap;
};
// === Tab Switching ===
const switchFiscalYearTab = (fiscalYear) => {
    currentFiscalYear = fiscalYear;
    
    // Update tab buttons
    document.querySelectorAll('.fy-tab-button').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Re-render table
    renderMonthlyDataTable();
};

// === Handle Modal Submit ===
const handleModalSubmit = async () => {
    const year = parseInt($('modalYear').value);
    const month = $('modalMonth').value;
    const emailCount = $('modalEmailInput').value.trim();
    const smsCount = $('modalSmsInput').value.trim();
    const whatsappCount = $('modalWhatsappInput').value.trim();
    const contactsCount = $('modalContactsInput').value.trim();
    const maisonNotes = $('modalNotesInput').value.trim();
    
    // Validation: all fields must be filled
    if (!emailCount || !smsCount || !whatsappCount || !contactsCount) {
        alert('Please fill in all four metrics (Email, SMS, WhatsApp, Contacts).');
        return;
    }
    
    const emailNum = parseInt(emailCount);
    const smsNum = parseInt(smsCount);
    const whatsappNum = parseInt(whatsappCount);
    const contactsNum = parseInt(contactsCount);
    
    // Validation: no negative numbers
    if (emailNum < 0 || smsNum < 0 || whatsappNum < 0 || contactsNum < 0) {
        alert('Quantities cannot be negative!');
        return;
    }
    
    // Confirmation dialog
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
    
    // Submit data
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
        
        // Refresh table and history
        renderMonthlyDataTable();
        loadTable('maison', $('maisonDataTableContainer'), { submittedBy: currentUser.username });
        loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
        
        // Clear message after 3 seconds
        setTimeout(() => clr($('monthlyDataMessage')), 3000);
    } else {
        alert('Failed to submit data: ' + res.message);
    }
};

    // ===== API 调用 =====
    const api = async (act, data = {}) => {
        const silent = ['getConfig', 'checkExistingRecord', 'getUserEmail', 'getAllUsers', 'getAllSfmcHistory', 'getMaisonSfmcHistory', 'getForecastData', 'getAnnualBudgets'];
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

    // ===== 表格配置和渲染 =====
    const baseHeaders = [
        { key: 'MaisonName', label: 'Maison Name' },
        { key: 'Year', label: 'Year' },
        { key: 'Month', label: 'Month' },
        { key: 'EmailCount', label: 'Email' },
        { key: 'SMSCount', label: 'SMS' },
        { key: 'WhatsAppCount', label: 'WhatsApp' },
        { key: 'ContactsCount', label: 'Contacts' }
    ];

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
        maison: {
            action: 'getMaisonSfmcData',
            headers: [...baseHeaders, { key: 'Timestamp', label: 'Submission Time' }, { key: 'ApprovalStatus', label: 'Approval Status' }, { key: 'MaisonNotes', label: 'Notes' }],
            actionColumn: null
        },
        admin: {
            action: 'getAllSfmcData',
            headers: [...baseHeaders, { key: 'SubmittedBy', label: 'Submitted By' }, { key: 'Timestamp', label: 'Submission Time' }, { key: 'ApprovalStatus', label: 'Approval Status' }, { key: 'MaisonNotes', label: 'Maison Notes' }],
            actionColumn: 'approve'
        },
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

    // ===== 表格渲染 =====
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
        if (cfg.actionColumn) html += `<th>Approval Action</th>`;
        html += '</tr></thead><tbody>';

        res.data.forEach(row => {
            html += '<tr>' + cfg.headers.map(h => {
                let v = row[h.key];
                
                if (h.key === 'Timestamp' || h.key === 'ActionTimestamp') v = fmt(v);
                
                if (h.key === 'ApprovalStatus') {
                    if (cfg.renderStatusBadge === false) {
                        v = v ?? '';
                    } else {
                        const sc = { Pending: 'status-pending', Approved: 'status-approved', Rejected: 'status-rejected' }[v] || 'status-pending';
                        v = `<span class="status-badge ${sc}">${v}</span>`;
                    }
                }
                
                if ((h.key === 'MaisonNotes' || h.key === 'AdminNotes') && v && v.length > 50) {
                    v = `<span title="${v}">${v.substring(0, 50)}...</span>`;
                }
                
                return `<td>${v ?? ''}</td>`;
            }).join('');

            if (cfg.actionColumn === 'approve') {
                const recordId = row.RecordId || '';
                const submittedBy = row.SubmittedBy || '';
                const maisonName = row.MaisonName || '';
                const year = row.Year || '';
                const month = row.Month || '';
                const timestamp = row.Timestamp || '';
                const maisonNotes = row.MaisonNotes || '';
                
                const dataDetails = `Email: ${row.EmailCount || 0}, SMS: ${row.SMSCount || 0}, WhatsApp: ${row.WhatsAppCount || 0}, Contacts: ${row.ContactsCount || 0}`;
                
                html += `<td>
                    <button class="approve-button-table" 
                        data-id="${recordId}" 
                        data-submitted-by="${submittedBy}" 
                        data-maison-name="${maisonName}" 
                        data-year="${year}"
                        data-month="${month}"
                        data-timestamp="${timestamp}"
                        data-maison-notes="${maisonNotes}"
                        data-data-details="${dataDetails}">Approve</button>
                    <button class="reject-button-table" 
                        data-id="${recordId}" 
                        data-submitted-by="${submittedBy}" 
                        data-maison-name="${maisonName}" 
                        data-year="${year}"
                        data-month="${month}"
                        data-timestamp="${timestamp}"
                        data-maison-notes="${maisonNotes}"
                        data-data-details="${dataDetails}">Reject</button>
                </td>`;
            }
            
            html += '</tr>';
        });

        container.innerHTML = html + '</tbody></table>';
    };

    // ===== Forecast 表格渲染 =====
    const loadForecastTable = async (container, year) => {
        const budgetRes = await api('getAnnualBudgets', { year: year });
        const forecastRes = await api('getForecastData', { year: year });

        if (!forecastRes.success || !forecastRes.data) {
            container.innerHTML = `<p>Failed to load forecast data: ${forecastRes.message || 'Unknown error'}</p>`;
            return;
        }

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

        let html = '<table><thead><tr>';
        html += '<th>Maison</th>';
        html += '<th>Email<br>Forecast</th>';
        html += '<th>Email<br>Budget</th>';
        html += '<th>Email<br>Variance</th>';
        html += '<th>SMS<br>Forecast</th>';
        html += '<th>SMS<br>Budget</th>';
        html += '<th>SMS<br>Variance</th>';
        html += '<th>WhatsApp<br>Forecast</th>';
        html += '<th>WhatsApp<br>Budget</th>';
        html += '<th>WhatsApp<br>Variance</th>';
        html += '<th>Contacts<br>Forecast</th>';
        html += '<th>Contacts<br>Budget</th>';
        html += '<th>Contacts<br>Variance</th>';
        html += '</tr></thead><tbody>';

        if (forecastRes.data.length === 0) {
            html += '<tr><td colspan="13" style="text-align: center; padding: 20px; color: #666;">No forecast data available for this year.</td></tr>';
            html += '</tbody></table>';
            container.innerHTML = html;
            return;
        }

        const varianceThreshold = parseFloat(configPrices.VarianceThreshold) || 15;

        forecastRes.data.forEach(item => {
            const maisonBudget = budgets[item.MaisonName] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            
            html += '<tr>';
            html += `<td>${item.MaisonName}</td>`;
            
            // Email
            const emailForecast = item.TotalEmail || 0;
            const emailBudget = maisonBudget.email;
            const emailVariance = emailBudget > 0 ? ((emailForecast - emailBudget) / emailBudget * 100) : 0;
            let emailVarianceClass = 'variance-good';
            if (Math.abs(emailVariance) > varianceThreshold) {
                emailVarianceClass = 'variance-danger';
            } else if (Math.abs(emailVariance) > varianceThreshold / 2) {
                emailVarianceClass = 'variance-warning';
            }
            html += `<td>${emailForecast}</td>`;
            html += `<td>${emailBudget}</td>`;
            html += `<td class="${emailVarianceClass}">${emailVariance >= 0 ? '+' : ''}${emailVariance.toFixed(1)}%</td>`;
            
            // SMS
            const smsForecast = item.TotalSMS || 0;
            const smsBudget = maisonBudget.sms;
            const smsVariance = smsBudget > 0 ? ((smsForecast - smsBudget) / smsBudget * 100) : 0;
            let smsVarianceClass = 'variance-good';
            if (Math.abs(smsVariance) > varianceThreshold) {
                smsVarianceClass = 'variance-danger';
            } else if (Math.abs(smsVariance) > varianceThreshold / 2) {
                smsVarianceClass = 'variance-warning';
            }
            html += `<td>${smsForecast}</td>`;
            html += `<td>${smsBudget}</td>`;
            html += `<td class="${smsVarianceClass}">${smsVariance >= 0 ? '+' : ''}${smsVariance.toFixed(1)}%</td>`;
            
            // WhatsApp
            const whatsappForecast = item.TotalWhatsApp || 0;
            const whatsappBudget = maisonBudget.whatsapp;
            const whatsappVariance = whatsappBudget > 0 ? ((whatsappForecast - whatsappBudget) / whatsappBudget * 100) : 0;
            let whatsappVarianceClass = 'variance-good';
            if (Math.abs(whatsappVariance) > varianceThreshold) {
                whatsappVarianceClass = 'variance-danger';
            } else if (Math.abs(whatsappVariance) > varianceThreshold / 2) {
                whatsappVarianceClass = 'variance-warning';
            }
            html += `<td>${whatsappForecast}</td>`;
            html += `<td>${whatsappBudget}</td>`;
            html += `<td class="${whatsappVarianceClass}">${whatsappVariance >= 0 ? '+' : ''}${whatsappVariance.toFixed(1)}%</td>`;
            
            // Contacts
            const contactsForecast = item.TotalContacts || 0;
            const contactsBudget = maisonBudget.contacts;
            const contactsVariance = contactsBudget > 0 ? ((contactsForecast - contactsBudget) / contactsBudget * 100) : 0;
            let contactsVarianceClass = 'variance-good';
            if (Math.abs(contactsVariance) > varianceThreshold) {
                contactsVarianceClass = 'variance-danger';
            } else if (Math.abs(contactsVariance) > varianceThreshold / 2) {
                contactsVarianceClass = 'variance-warning';
            }
            html += `<td>${contactsForecast}</td>`;
            html += `<td>${contactsBudget}</td>`;
            html += `<td class="${contactsVarianceClass}">${contactsVariance >= 0 ? '+' : ''}${contactsVariance.toFixed(1)}%</td>`;
            
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    };

    // ===== 事件委托：表格按钮 =====
    document.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (!id) return;

        if (e.target.classList.contains('approve-button-table') || e.target.classList.contains('reject-button-table')) {
            const st = e.target.classList.contains('approve-button-table') ? 'Approved' : 'Rejected';
            
            const submittedBy = e.target.dataset.submittedBy || '';
            const maisonName = e.target.dataset.maisonName || '';
            const year = e.target.dataset.year || '';
            const month = e.target.dataset.month || '';
            const timestamp = e.target.dataset.timestamp || '';
            const maisonNotes = e.target.dataset.maisonNotes || '';
            const dataDetails = e.target.dataset.dataDetails || '';
            
            const adminNotes = prompt(`${st === 'Approved' ? 'Approve' : 'Reject'} this submission?\n\nYear-Month: ${year}-${month}\nMaison: ${maisonName}\nData: ${dataDetails}\n\nYou can add optional notes below:`, '');
            
            if (adminNotes === null) return;
            
            const res = await api('updateApprovalStatus', { 
                recordId: id, 
                newStatus: st, 
                actionBy: currentUser.username,
                adminNotes: adminNotes
            });
            
            msg($('loginMessage'), res.success ? `Status: ${st}` : 'Update failed: ' + res.message, res.success);
            
            if (res.success) {
                loadTable('admin', $('overviewDataTableContainer'));
                loadTable('adminHistory', $('adminHistoryTableContainer'));
                
                if (submittedBy) {
                    sendApprovalNotification(submittedBy, st, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes);
                }
            }
        }
    });

    // ===== Email 管理 =====
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

    const buildNotificationBody = (submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes) => {
        const statusText = status === 'Approved' ? 'Approved' : 'Rejected';
        const formattedTimestamp = timestamp ? fmt(timestamp) : (timestamp || '');
        return (
            `Dear ${submittedBy},\n\n` +
            `Your SFMC data submission has been ${statusText.toLowerCase()}.\n\n` +
            `Details:\n` +
            `Maison Name: ${maisonName || ''}\n` +
            `Year-Month: ${year || ''}-${month || ''}\n` +
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
            const subject = `SFMC Data Submission ${statusText} - ${maisonName} (${year}-${month})`;
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

            $('emailBroadcastSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
            msg($('emailBroadcastMessage'), 'Notification email prepared. Click "Open in Outlook" to send.', true);
        } catch (error) {
            console.error('Error preparing approval notification:', error);
            msg($('emailBroadcastMessage'), 'Failed to prepare notification: ' + (error.message || 'Unknown error'), false);
        }
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

    // ===== 填充选择器 =====
    const popYearSelectors = () => {
        const years = [currentYear - 1, currentYear, currentYear + 1];
        const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
        
        if ($('budgetYearSelect')) $('budgetYearSelect').innerHTML = yearOptions;
        if ($('dataYearSelect')) $('dataYearSelect').innerHTML = yearOptions;
        if ($('forecastYearSelect')) $('forecastYearSelect').innerHTML = yearOptions;
        
        if ($('budgetYearSelect')) $('budgetYearSelect').value = currentYear;
        if ($('dataYearSelect')) $('dataYearSelect').value = currentYear;
        if ($('forecastYearSelect')) $('forecastYearSelect').value = currentYear;
    };

    const popMaisonSelectors = async () => {
        const res = await api('getAllUsers');
        if (!res.success || !res.data) return;
        
        const maisons = [...new Set(res.data
            .filter(u => u.maisonName && u.maisonName !== 'BT')
            .map(u => u.maisonName))];
        
        const maisonOptions = maisons.map(m => `<option value="${m}">${m}</option>`).join('');
        
        if ($('budgetMaisonSelect')) $('budgetMaisonSelect').innerHTML = maisonOptions;
    };

    // ===== 导出功能 =====
    const exportOverviewData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        const res = await api('getAllSfmcData');
        if (!res.success || !res.data || !res.data.length) { 
            msg($('loginMessage'), 'Export failed: No data available.', false); 
            return; 
        }
        
        const h = configs.admin.headers;
        let csv = h.map(x => x.label).join(',') + '\n';
        
        res.data.forEach(r => { 
            csv += h.map(x => { 
                let v = r[x.key]; 
                if (x.key === 'Timestamp') v = fmt(v); 
                return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? ''); 
            }).join(',') + '\n'; 
        });
        
        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b); 
        l.download = `SFMC_Overview_Export_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l); 
        l.click(); 
        document.body.removeChild(l);
        
        msg($('loginMessage'), 'Overview data exported successfully!', true);
    };

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
    };

    const exportForecastData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        
        const year = parseInt($('forecastYearSelect').value) || currentYear;
        const budgetRes = await api('getAnnualBudgets', { year: year });
        const forecastRes = await api('getForecastData', { year: year });
        
        if (!forecastRes.success || !forecastRes.data || !forecastRes.data.length) {
            msg($('loginMessage'), 'Export failed: No forecast data available.', false);
            return;
        }

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

        let csv = 'Maison,Email Forecast,Email Budget,Email Variance %,SMS Forecast,SMS Budget,SMS Variance %,WhatsApp Forecast,WhatsApp Budget,WhatsApp Variance %,Contacts Forecast,Contacts Budget,Contacts Variance %\n';

        forecastRes.data.forEach(item => {
            const maisonBudget = budgets[item.MaisonName] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            
            const emailForecast = item.TotalEmail || 0;
            const emailBudget = maisonBudget.email;
            const emailVariance = emailBudget > 0 ? ((emailForecast - emailBudget) / emailBudget * 100) : 0;
            
            const smsForecast = item.TotalSMS || 0;
            const smsBudget = maisonBudget.sms;
            const smsVariance = smsBudget > 0 ? ((smsForecast - smsBudget) / smsBudget * 100) : 0;
            
            const whatsappForecast = item.TotalWhatsApp || 0;
            const whatsappBudget = maisonBudget.whatsapp;
            const whatsappVariance = whatsappBudget > 0 ? ((whatsappForecast - whatsappBudget) / whatsappBudget * 100) : 0;
            
            const contactsForecast = item.TotalContacts || 0;
            const contactsBudget = maisonBudget.contacts;
            const contactsVariance = contactsBudget > 0 ? ((contactsForecast - contactsBudget) / contactsBudget * 100) : 0;
            
            csv += `${item.MaisonName},${emailForecast},${emailBudget},${emailVariance >= 0 ? '+' : ''}${emailVariance.toFixed(1)}%,${smsForecast},${smsBudget},${smsVariance >= 0 ? '+' : ''}${smsVariance.toFixed(1)}%,${whatsappForecast},${whatsappBudget},${whatsappVariance >= 0 ? '+' : ''}${whatsappVariance.toFixed(1)}%,${contactsForecast},${contactsBudget},${contactsVariance >= 0 ? '+' : ''}${contactsVariance.toFixed(1)}%\n`;
        });

        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b);
        l.download = `SFMC_Forecast_${year}_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l);
        l.click();
        document.body.removeChild(l);

        msg($('loginMessage'), `Forecast data for ${year} exported successfully!`, true);
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
                    
                    // Initialize fiscal year to current year
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1; // 1-12
                    // If current month is Jan, we're in previous fiscal year
                    currentFiscalYear = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
                    
                    // Render monthly data table
                    renderMonthlyDataTable();
                    
                    // Load other tables
                    loadTable('maison', $('maisonDataTableContainer'), { submittedBy: currentUser.username });
                    loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
                    
                    // Initialize email management
                    initEmail();
                    
                    // Clear any messages
                    clr($('monthlyDataMessage'));
                }
                 else {
                    $('adminView').classList.remove('hidden'); 
                    $('maisonView').classList.add('hidden');
                    
                    popYearSelectors();
                    popMaisonSelectors();
                    
                    loadTable('admin', $('overviewDataTableContainer'));
                    loadTable('adminHistory', $('adminHistoryTableContainer'));
                    loadForecastTable($('forecastTableContainer'), currentYear);
                    initBcast();
                }
                
            }, 500);
        },

        logoutButton: () => {
            currentUser = null;
            $('username').value = $('password').value = '';
            clr($('loginMessage')); 
            clr($('maisonSubmitMessage')); 
            clr($('emailMessage')); 
            clr($('emailBroadcastMessage'));
            clr($('validationMessage'));
            showPage($('loginPage'));
        },

        

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

        submitBudgetButton: async () => {
            if (!currentUser || currentUser.role !== 'admin') { 
                msg($('budgetSubmitMessage'), 'Admin only!', false); 
                return; 
            }
            
            const year = parseInt($('budgetYearSelect').value);
            const maison = $('budgetMaisonSelect').value;
            const emailBudget = parseInt($('emailBudgetInput').value) || 0;
            const smsBudget = parseInt($('smsBudgetInput').value) || 0;
            const whatsappBudget = parseInt($('whatsappBudgetInput').value) || 0;
            const contactsBudget = parseInt($('contactsBudgetInput').value) || 0;
            
            if (!maison) { 
                msg($('budgetSubmitMessage'), 'Please select a Maison!', false); 
                return; 
            }
            
            if (emailBudget < 0 || smsBudget < 0 || whatsappBudget < 0 || contactsBudget < 0) {
                msg($('budgetSubmitMessage'), 'Budgets cannot be negative!', false);
                return;
            }
            
            clr($('budgetSubmitMessage'));
            msg($('budgetSubmitMessage'), 'Submitting budget...', true);
            
            const res = await api('setAnnualBudget', {
                maisonName: maison,
                year: year,
                emailBudget: emailBudget,
                smsBudget: smsBudget,
                whatsappBudget: whatsappBudget,
                contactsBudget: contactsBudget,
                updatedBy: currentUser.username
            });
            
            msg($('budgetSubmitMessage'), res.success ? 'Budget set successfully!' : 'Failed: ' + res.message, res.success);
            
            if (res.success) {
                $('emailBudgetInput').value = '0';
                $('smsBudgetInput').value = '0';
                $('whatsappBudgetInput').value = '0';
                $('contactsBudgetInput').value = '0';
                
                // 重新加载 Forecast 表格
                const forecastYear = parseInt($('forecastYearSelect').value) || currentYear;
                loadForecastTable($('forecastTableContainer'), forecastYear);
            }
        },

        forecastYearSelect: async () => {
            const year = parseInt($('forecastYearSelect').value) || currentYear;
            loadForecastTable($('forecastTableContainer'), year);
        },

        exportOverviewDataButton: exportOverviewData,
        exportHistoryDataButton: exportHistoryData,
        exportForecastButton: exportForecastData,

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
        }
    };

    // 统一绑定事件
    Object.keys(handlers).forEach(id => {
        const element = $(id);
        if (element) {
            element.addEventListener('click', handlers[id]);
        } else {
            console.warn(`Element with ID "${id}" not found. Skipping event listener.`);
        }
    });
    // === New Event Listeners for Monthly Data Table ===

// Fiscal Year Tab buttons
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTab(fiscalYear);
    }
});

// Action buttons in monthly data table
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('action-button-table')) {
        const year = parseInt(e.target.dataset.year);
        const month = e.target.dataset.month;
        const hasData = e.target.dataset.hasData === 'true';
        
        // Get existing data if available
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

    // 搜索输入框事件
    const userSearchInput = $('userSearchInput');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', () => { 
            searchTerm = $('userSearchInput').value.trim(); 
            renderU(); 
            updCnt(); 
        });
    }



    // 初始化
    showPage($('loginPage'));
});

