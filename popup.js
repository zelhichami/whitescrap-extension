document.addEventListener('DOMContentLoaded', () => {
    // Views
    const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');

    // Login Elements
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');

    // Main View Elements
    const daysInput = document.getElementById('days-input');
    const senderContainer = document.getElementById('sender-list-container');
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const logoutButton = document.getElementById('logout-button');

    // --- VIEW MANAGEMENT ---
    const showLoginView = () => {
        loginView.style.display = 'block';
        mainView.style.display = 'none';
        passwordInput.value = '';
        loginStatus.textContent = '';
    };

    const showMainView = (senders) => {
        loginView.style.display = 'none';
        mainView.style.display = 'block';
        populateSenderList(senders);
    };

    const populateSenderList = (senders) => {
        senderContainer.innerHTML = '';
        if (senders && senders.length > 0) {
            senders.forEach(sender => {
                const label = document.createElement('label');
                label.className = 'sender-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = sender;
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(sender));
                senderContainer.appendChild(label);
            });
        } else {
            senderContainer.innerHTML = '<p>No senders configured for your account.</p>';
            startButton.disabled = true;
        }
    };

    // --- STATE & AUTHENTICATION ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginStatus.textContent = 'Logging in...';
        loginButton.disabled = true;

        // Step 1: Login
        const loginResponse = await authenticateUser(usernameInput.value, passwordInput.value);
        if (!loginResponse || !loginResponse.status) {
            loginStatus.textContent = loginResponse.message || 'Login failed.';
            loginButton.disabled = false;
            return;
        }

        // Step 2: Fetch Senders (includes VPN check)
        loginStatus.textContent = 'Fetching senders...';
        const sendersResponse = await fetchSenders(loginResponse.access_token);
        if (!sendersResponse || !sendersResponse.status) {
            loginStatus.textContent = sendersResponse.message || 'Could not fetch senders.';
            loginButton.disabled = false;
            return;
        }
        if (sendersResponse.vpn === true) {
            loginStatus.textContent = 'Connection failed: Please disable your VPN.';
            loginButton.disabled = false;
            return;
        }
        if (!sendersResponse.senders || sendersResponse.senders.length === 0) {
            loginStatus.textContent = 'No senders found for your account.';
            // Still log them in, but they can't do anything
        }

        // Step 3: Fetch Settings
        loginStatus.textContent = 'Fetching settings...';
        const settings = await fetchSettings(loginResponse.access_token);
        if (!settings) {
            loginStatus.textContent = 'Failed to fetch app settings.';
            loginButton.disabled = false;
            return;
        }

        // All successful, store data and switch view
        await chrome.storage.local.set({
            accessToken: loginResponse.access_token,
            senders: sendersResponse.senders || [],
            settings: settings
        });
        showMainView(sendersResponse.senders);
        loginButton.disabled = false;
    });

    logoutButton.addEventListener('click', async () => {
        await chrome.storage.local.clear();
        showLoginView();
    });

    // --- AUTOMATION CONTROL ---
    const syncButtonStates = async () => {
        const data = await chrome.storage.local.get('isAutomationRunning');
        startButton.disabled = data.isAutomationRunning;
        stopButton.disabled = !data.isAutomationRunning;
    };

    startButton.addEventListener('click', async () => {
        const selectedCheckboxes = document.querySelectorAll('#sender-list-container input[type="checkbox"]:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Please select at least one sender.");
            return;
        }

        await chrome.storage.local.set({ isAutomationRunning: true });
        await syncButtonStates();

        const selectedSenders = Array.from(selectedCheckboxes).map(cb => cb.value);
        const days = parseInt(daysInput.value, 10) || 1;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes("mail.google.com")) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "startAutomation",
                    senders: selectedSenders,
                    days: days
                });
                window.close();
            } else {
                alert("Please navigate to mail.google.com to use this extension.");
            }
        });
    });

    stopButton.addEventListener('click', async () => {
        await chrome.storage.local.set({ isAutomationRunning: false });
        await syncButtonStates();
    });

    // --- INITIALIZATION ---
    const initialize = async () => {
        const data = await chrome.storage.local.get(['accessToken', 'senders']);
        if (data.accessToken) {
            showMainView(data.senders);
            await syncButtonStates();
        } else {
            showLoginView();
        }
    };

    initialize();
});
