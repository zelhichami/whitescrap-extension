// The API endpoint for all communications
const API_ENDPOINT = 'https://whitescrap-api.humming-mail.com';

/**
 * Authenticates the user against the API.
 * @param {string} username The user's username.
 * @param {string} password The user's password.
 * @returns {Promise<object>} The JSON response from the API.
 */
async function authenticateUser(username, password) {
    try {
        const response = await fetch(`${API_ENDPOINT}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        });
        return await response.json();
    } catch (error) {
        console.error('Authentication API call failed:', error);
        return { status: false, message: 'Could not connect to the server.' };
    }
}

/**
 * Fetches the list of senders from the API.
 * @param {string} accessToken The user's valid access token.
 * @returns {Promise<object>} The JSON response from the API.
 */
async function fetchSenders(accessToken) {
    try {
        const response = await fetch(`${API_ENDPOINT}/api/senders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `access_token=${encodeURIComponent(accessToken)}`
        });
        return await response.json();
    } catch (error) {
        console.error('Senders API call failed:', error);
        return { status: false, message: 'Could not fetch senders.' };
    }
}

/**
 * Fetches the settings object from the API.
 * @param {string} accessToken The user's valid access token.
 * @returns {Promise<object|null>} The settings object or null if failed.
 */
async function fetchSettings(accessToken) {
    try {
        const response = await fetch(`${API_ENDPOINT}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `access_token=${encodeURIComponent(accessToken)}`
        });
        const result = await response.json();
        if (result.settings) {
            return result.settings;
        }
        return null;
    } catch (error) {
        console.error('Settings API call failed:', error);
        return null;
    }
}


/**
 * Logs a successful action to the statistics API.
 * @param {string} accessToken The user's access token.
 * @param {string} sender The sender for which the action was performed.
 * @returns {Promise<boolean>} True if the log was successful, false otherwise.
 */
async function logStat(accessToken, sender) {
    try {
        const response = await fetch(`${API_ENDPOINT}/api/logger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `access_token=${encodeURIComponent(accessToken)}&sender=${encodeURIComponent(sender)}&email=extension_user`
        });
        const result = await response.json();
        return result.status === true;
    } catch (error) {
        console.error('Logger API call failed:', error);
        return false;
    }
}
