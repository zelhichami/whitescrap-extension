document.addEventListener('DOMContentLoaded', () => {
    // Views
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');

    // Login Elements
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');

    // Main App Elements
    const logoutButton = document.getElementById('logout-button');
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');

    // Main Tab Elements
    const daysInput = document.getElementById('days-input');
    const senderContainer = document.getElementById('sender-list-container');
    const senderSearch = document.getElementById('sender-search');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');

    // Log Tab Elements
    const logConsole = document.getElementById('log-console');

    // Tab Navigation Elements
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // --- VIEW & TAB MANAGEMENT ---
    const showLoginView = () => {
        loginView.style.display = 'block';
        appView.style.display = 'none';
        passwordInput.value = '';
        loginStatus.textContent = '';
    };

    const showAppView = (senders) => {
        loginView.style.display = 'none';
        appView.style.display = 'block';
        populateSenderList(senders);
        selectAllCheckbox.checked = true;
    };

    const switchTab = (tabId) => {
        tabLinks.forEach(l => l.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        const newActiveTab = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
        const newActivePane = document.getElementById(`${tabId}-tab-content`);

        if (newActiveTab) newActiveTab.classList.add('active');
        if (newActivePane) newActivePane.classList.add('active');
    };

    tabLinks.forEach(link => {
        link.addEventListener('click', () => switchTab(link.dataset.tab));
    });

    // --- SENDER & LOG LISTS ---
    const populateSenderList = (senders) => {
        senderContainer.innerHTML = '';
        if (senders && senders.length > 0) {
            senders.forEach(sender => {
                const label = document.createElement('label');
                label.className = 'sender-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = sender;
                checkbox.checked = true;
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(sender));
                senderContainer.appendChild(label);
            });
        } else {
            senderContainer.innerHTML = '<p style="padding: 10px;">No senders configured.</p>';
            startButton.disabled = true;
        }
    };

    /**
     * Renders a log entry to the DOM with smart scrolling.
     */
    const renderLogEntry = (log) => {
        const { message, type, timestamp } = log;

        // Check if the user is near the bottom before appending the new log.
        const scrollThreshold = 20; // A small pixel buffer
        const isScrolledToBottom = logConsole.scrollHeight - logConsole.clientHeight <= logConsole.scrollTop + scrollThreshold;

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        //logEntry.textContent = `[${timestamp}] ${message}`;
        logEntry.textContent = `${message}`;
        logConsole.appendChild(logEntry);

        // Only scroll to the bottom if the user was already there.
        if (isScrolledToBottom) {
            logConsole.scrollTop = logConsole.scrollHeight;
        }
    };

    /**
     * Adds a timestamp, saves a new log entry to storage, and then renders it.
     */
    const saveAndRenderLog = async (logData) => {
/*        const logWithTimestamp = {
            ...logData,
            timestamp: new Date().toLocaleTimeString()
        };*/

        const data = await chrome.storage.local.get('executionLogs');
        const logs = data.executionLogs || [];
        logs.push(logData);
        await chrome.storage.local.set({ executionLogs: logs });

        renderLogEntry(logData);
    };

    // --- LISTENERS ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "log") {
            saveAndRenderLog(message.data);
        } else if (message.action === "automationFinished") {
            syncButtonStates();
            const logType = message.error ? 'error' : 'success';
            const logMessage = message.error ? ` ` : `PROCESS FINISHED. Total processed: ${message.total}`;
            saveAndRenderLog({ message: logMessage, type: logType });
        }
    });

    senderSearch.addEventListener('input', () => {
        const filter = senderSearch.value.toLowerCase();
        Array.from(senderContainer.children).forEach(item => {
            const senderName = item.textContent.toLowerCase();
            item.style.display = senderName.includes(filter) ? 'flex' : 'none';
        });
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        const visibleCheckboxes = Array.from(senderContainer.querySelectorAll('input[type="checkbox"]'))
            .filter(cb => cb.parentElement.style.display !== 'none');

        visibleCheckboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    // --- STATE & AUTHENTICATION ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginStatus.textContent = 'Logging in...';
        loginButton.disabled = true;

        const loginResponse = await authenticateUser(usernameInput.value, passwordInput.value);
        if (!loginResponse || !loginResponse.status) {
            loginStatus.textContent = loginResponse.message || 'Login failed.';
            loginButton.disabled = false;
            return;
        }

        loginStatus.textContent = 'Fetching data...';
        const [sendersResponse, settings] = await Promise.all([
            fetchSenders(loginResponse.access_token),
            fetchSettings(loginResponse.access_token)
        ]);

        if (!sendersResponse || !sendersResponse.status || !settings) {
            loginStatus.textContent = 'Failed to fetch account data.';
            loginButton.disabled = false;
            return;
        }

        if (sendersResponse.vpn === true) {
            loginStatus.textContent = 'Connection failed: Please disable your VPN.';
            loginButton.disabled = false;
            return;
        }

        await chrome.storage.local.set({
            accessToken: loginResponse.access_token,
            senders: sendersResponse.senders || [],
            settings: settings
        });

        showAppView(sendersResponse.senders);
        loginButton.disabled = false;
    });

    logoutButton.addEventListener('click', async () => {
        await chrome.storage.local.clear();
        showLoginView();
    });

    // --- AUTOMATION CONTROL ---
    const syncButtonStates = async () => {
        const data = await chrome.storage.local.get('isAutomationRunning');
        const isRunning = data.isAutomationRunning === true;
        startButton.disabled = isRunning;
        stopButton.disabled = !isRunning;
    };

    startButton.addEventListener('click', async () => {
        const selectedCheckboxes = document.querySelectorAll('#sender-list-container input[type="checkbox"]:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Please select at least one sender.");
            return;
        }

        await chrome.storage.local.set({ executionLogs: [] });
        logConsole.innerHTML = '';

        await chrome.storage.local.set({ isAutomationRunning: true });
        await syncButtonStates();
        switchTab('log');

        const selectedSenders = Array.from(selectedCheckboxes).map(cb => cb.value);
        const days = parseInt(daysInput.value, 10) || 1;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes("mail.google.com")) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "startAutomation",
                    senders: selectedSenders,
                    days: days
                });
            } else {
                alert("Please navigate to mail.google.com to use this extension.");
                chrome.storage.local.set({ isAutomationRunning: false });
                syncButtonStates();
                switchTab('main');
            }
        });
    });

    stopButton.addEventListener('click', async () => {
        await chrome.storage.local.set({ isAutomationRunning: false });
        await syncButtonStates();
        //saveAndRenderLog({ message: 'Stop command sent. The process will halt shortly.', type: 'warn' });
    });

    // --- INITIALIZATION ---
    const initialize = async () => {
        const data = await chrome.storage.local.get(['accessToken', 'senders', 'isAutomationRunning', 'executionLogs']);

        if (data.executionLogs) {
            logConsole.innerHTML = '';
            data.executionLogs.forEach(log => renderLogEntry(log));
        }

        if (data.accessToken) {
            showAppView(data.senders);
            if (data.isAutomationRunning) {
                switchTab('log');
                //renderLogEntry({ message: 'Reconnected to running process...', type: 'warn', timestamp: new Date().toLocaleTimeString() });
            }
        } else {
            showLoginView();
        }
        await syncButtonStates();
    };

    initialize();
});