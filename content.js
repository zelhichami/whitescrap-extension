/**
 * content.js
 * This script combines the stable global loop logic with dynamic settings
 * for CTA links, using static selectors for core functionality.
 */
console.log("Whitescrap v4.0");

let emailProcessOpnedCount = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
async function sendLog(message, type = 'info') {
    // Also log to console for debugging purposes
    switch (type) {
        case 'success':
            console.log(`✅ ${message}`);
            break;
        case 'error':
            console.error(`❌ ${message}`);
            break;
        case 'warn':
            console.warn(`⚠️ ${message}`);
            break;
        default:
            console.log(message);
    }
    // Send log to popup UI
    chrome.runtime.sendMessage({ action: "log", data: { message, type } });
}


async function checkIfStopped() {
    const data = await chrome.storage.local.get('isAutomationRunning');
    if (data.isAutomationRunning === false) {
        throw new Error("STOP_EXECUTION");
    }
}

// Add this new helper function to content.js
async function waitForElements(selector, timeout = 15000) {
    //await sendLog(`Waiting for elements: ${selector}`);
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                //sendLog(`Found ${elements.length} elements.`);
                clearInterval(intervalId);
                resolve(Array.from(elements)); // Return all found elements as a proper array
            } else if (Date.now() - startTime > timeout) {
                clearInterval(intervalId);
                reject(new Error(`Timed out waiting for elements with selector: ${selector}`));
            }
        }, 500);
    });
}



function waitForElement(selector, timeout = 15000) {
    if (!selector) {
        throw new Error("waitForElement was called with an undefined or null selector.");
    }
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(intervalId);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(intervalId);
                reject(new Error(`Timed out waiting for element with selector: ${selector}`));
            }
        }, 500);
    });
}

async function humanLikeWait(min = 800, max = 1500) {
    await checkIfStopped();
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

function simulateHumanClick(element) {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + (rect.width / 2);
    const clientY = rect.top + (rect.height / 2);
    const commonEventProps = { bubbles: true, cancelable: true, view: window, clientX, clientY };
    element.dispatchEvent(new MouseEvent('mousedown', commonEventProps));
    element.dispatchEvent(new MouseEvent('mouseup', commonEventProps));
    element.dispatchEvent(new MouseEvent('click', commonEventProps));
}

function getElementByXPath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startAutomation" && message.senders && message.days) {
        let title = document.title;
        let email = title.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

        if (email) {
            sendLog(`Account: ${email[0]}`,"success");

        } else {
            sendLog("No email found in page title.", "error");
            throw new Error("STOP_EXECUTION");
            return false;
        }
        runFullSequence(message.senders, message.days, email ? email[0] : 'unknown');
    }
});


// ============================================================================
// MASTER SEQUENCE FUNCTION
// ============================================================================
async function runFullSequence(senders, days, email) {
    try {
        await sendLog(`\ `);
        await sendLog("#*# Whitescrap STARTED #*#","success");
        await sendLog(`\ `);
        emailProcessOpnedCount = 0;

        const storage = await chrome.storage.local.get('settings');
        const settings = storage.settings;
        const data = await chrome.storage.local.get('accessToken');
        const access_token = data.accessToken;

        if (!settings || !settings.cta || !settings.cta.gmail) {
            throw new Error("Could not load required CTA settings from storage.");
        }
        //await sendLog("Settings loaded successfully.", "success");

        await cleanSpamFolder(senders);

        for (const sender of senders) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            const afterDateString = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            const senderQueryPart = `from:"${sender}"`;
            const searchQuery = `in:inbox is:unread (${senderQueryPart}) after:${afterDateString}`;

            await checkIfStopped();
            await sendLog(`\ `);
            await sendLog(`--- ${sender} ---`);

            await performSearch(searchQuery);
            await humanLikeWait(3000, 5000);
            await waitForElement('div.ae4[gh="tl"]');
            await humanLikeWait(3000, 5000);

            if (document.body.innerText.includes("No messages matched your search")) {
                await sendLog(`No emails for sender ${sender}.`);
                continue;
            }

            await processSearchResultsAndPaginate(settings, access_token, sender, email);
            //await sendLog(`--- Finished processing for sender ${sender} ---`, "success");
            await humanLikeWait(3000, 5000);
        }

        await sendLog("✅ Full sequence terminated normally!", "success");
        await sendLog(`Total emails processed: ${emailProcessOpnedCount}`, "success");

        // Notify popup that the process is finished
        chrome.runtime.sendMessage({ action: "automationFinished", total: emailProcessOpnedCount });

    } catch (error) {
        if (error.message === "STOP_EXECUTION") {
            await sendLog("🛑 Whitescrap stopped.", "warn");
        } else {
            await sendLog(`❌ The automation sequence FAILED: ${error.message}`, "error");
        }
        chrome.runtime.sendMessage({ action: "automationFinished", error: error.message });
    } finally {
        //await sendLog("Resetting running state.");
        await chrome.storage.local.set({ isAutomationRunning: false });
    }
}

// ============================================================================
// ACTION SUB-FUNCTIONS
// ============================================================================

async function cleanSpamFolder(senders) {
    await sendLog("--- Cleaning Spam Folder ---");
    await checkIfStopped();

    let spamLink = document.querySelector('a[href$="#spam"]');
    if (!spamLink) {
        const moreButton = await waitForElement('div.TK .n6 span[role="button"]');
        simulateHumanClick(moreButton);
        //await sendLog("Clicked 'More' to find Spam folder.");
        spamLink = await waitForElement('a[href$="#spam"]');
    }
    simulateHumanClick(spamLink);
    //await sendLog("Navigated to Spam folder.");
    await humanLikeWait(2000, 3000);

    const spamSearchQuery = `in:spam (${senders.map(s => `from:"${s}"`).join(' OR ')})`;
    await performSearch(spamSearchQuery);
    await humanLikeWait(2000, 3000);

    const noResultsElement = document.querySelector('td.TC');
    if (noResultsElement && (noResultsElement.textContent.includes("No messages matched your search") || noResultsElement.textContent.includes("You don't have any spam here"))) {
        await sendLog("No relevant emails found in spam. Skipping cleaning.", "success");
    } else {
        const selectAllCheckbox = await waitForElements('span[role="checkbox"]');
        const lastCheckbox = selectAllCheckbox[selectAllCheckbox.length - 1];
        simulateHumanClick(lastCheckbox);
        //await sendLog("Selected all messages in spam.");
        await humanLikeWait();

        const notSpamButton = await waitForElement('div[role="button"][data-tooltip="Not spam"]');
        simulateHumanClick(notSpamButton);
        //await sendLog("Clicked 'Not spam'.");

        await waitForElement("div[role='alert']");
        await sendLog("Successfully moved relevant spam to inbox.", "success");
        await humanLikeWait(1000, 1500);
    }
}

async function performSearch(query) {
    const searchBarSelector = 'input[aria-label="Search mail"]';
    const searchBar = await waitForElement(searchBarSelector);
    searchBar.value = query;
    searchBar.focus();
    searchBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    //await sendLog(`Search executed for: ${query}`);
}

async function findAndClickCTA(settings, access_token, sender_name, email) {
    const ctaXpaths = settings.cta.gmail;
    if (!ctaXpaths || ctaXpaths.length === 0) {
        await sendLog("No CTA selectors found in settings.", "error");
        return false;
    }
    let cta_exist = false;
    for (const xpath of ctaXpaths) {
        const ctaButton = getElementByXPath(xpath);
        if (ctaButton && ctaButton.href) {
            cta_exist = true;
            try {
                const response = await chrome.runtime.sendMessage({ action: "openAndWait", url: ctaButton.href });
                if (response && response.status === "success") {
                    await sendLog("🟢 Link opened successfully.","success");
                }else{
                    await sendLog(`🛑 URL: ${ctaButton.href}`, "error");
                }
            } catch (e) {
                await sendLog("Tab may not have closed automatically.", "warn");
            }
        }
    }
    const response = await chrome.runtime.sendMessage({ action: "logger", access_token: access_token, sender: sender_name, email: email });

    if (response && response.status === "error") {
        await sendLog("🛑 Logger API call failed.", "error");
        throw new Error("Logger API error");
    }
    if (cta_exist) {
        return true;
    } else {
        await sendLog("No CTA button was found for this email.", "warn");
        return false;
    }
}

async function processSearchResultsAndPaginate(settings, access_token, sender, email) {
    const firstEmailSelectors = await waitForElements('table[role="grid"] tr.zA:first-of-type');
    const firstEmail = firstEmailSelectors[firstEmailSelectors.length - 1];
    simulateHumanClick(firstEmail);

    const emailOpenIndicator = 'button[aria-label="Print all"]';
    await waitForElement(emailOpenIndicator);
    //await sendLog("Opened the first email in the search results.");
    await humanLikeWait();

    while (true) {
        await checkIfStopped();
        emailProcessOpnedCount++;
        await sendLog(`Processing email #${emailProcessOpnedCount}...`);

        const subjectElement = document.querySelector('h2.hP');
        const currentSubject = subjectElement ? subjectElement.textContent : "No Subject";
        await sendLog(`Subject: ${currentSubject}`);

        await findAndClickCTA(settings, access_token, sender, email);

        const olderButtons = await waitForElements('div[role="button"][data-tooltip="Older"]');
        const olderButton = olderButtons[olderButtons.length - 1];

        if (!olderButton || olderButton.getAttribute('aria-disabled') === 'true') {
            //await sendLog("Reached the last email in this batch.", "warn");
            break;
        }

        simulateHumanClick(olderButton);
        //await sendLog("Clicked 'Older', waiting for next email to load...");

        await new Promise((resolve, reject) => {
            const startTime = Date.now();
            const intervalId = setInterval(() => {
                const newSubjectElement = document.querySelector('h2.hP');
                const newSubject = newSubjectElement ? newSubjectElement.textContent : null;
                if (newSubject !== currentSubject) {
                    //sendLog("Next email loaded.", "success");
                    clearInterval(intervalId);
                    resolve();
                } else if (Date.now() - startTime > 10000) {
                    clearInterval(intervalId);
                    reject(new Error("Timed out waiting for the next email to load after clicking 'Older'."));
                }
            }, 500);
        });

        await humanLikeWait();
    }
}