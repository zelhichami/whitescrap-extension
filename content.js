/**
 * content.js
 * This script combines the stable global loop logic with dynamic settings
 * for CTA links, using static selectors for core functionality.
 */
console.log("Gmail content script (v15 - Static Selectors) loaded.");

let emailProcessOpnedCount = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
async function checkIfStopped() {
    const data = await chrome.storage.local.get('isAutomationRunning');
    if (data.isAutomationRunning === false) {
        throw new Error("STOP_EXECUTION");
    }
}

// Add this new helper function to content.js
async function waitForElements(selector, timeout = 15000) {
    console.log(`Waiting for elements: ${selector}`);
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`Found ${elements.length} elements.`);
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

// Try to extract an email pattern from it
        let email = title.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

        if (email) {
            console.log("Connected Gmail:", email[0]);
        } else {
            console.log("No email found in page title");
        }
        runFullSequence(message.senders, message.days,email[0]);
    }
});


// ============================================================================
// MASTER SEQUENCE FUNCTION
// ============================================================================
async function runFullSequence(senders, days,email) {
    try {
        console.log("--- GLOBAL AUTOMATION LOOP STARTED ---");
        emailProcessOpnedCount = 0;

        const storage = await chrome.storage.local.get('settings');
        const settings = storage.settings;
        const data = await chrome.storage.local.get('accessToken');
        const access_token = data.accessToken;

        // Only check for the CTA settings, as other selectors are now static.
        if (!settings || !settings.cta || !settings.cta.gmail) {
            throw new Error("Could not load required CTA settings from storage.");
        }
        console.log("Settings loaded successfully.");

        // First, clean the spam folder
        await cleanSpamFolder(senders);
        for (const sender of senders) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            const afterDateString = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

            const senderQueryPart = `from:"${sender}"`;
            const searchQuery = `in:inbox is:unread (${senderQueryPart}) after:${afterDateString}`;


            await checkIfStopped();
            console.log("--- Starting New Search Cycle ---");

            await performSearch(searchQuery);
            await humanLikeWait(3000, 5000);
            // If there was no view, just wait for the new one to appear.
            //await waitForElement('#\\\\:mc');
            await waitForElement('div.ae4[gh="tl"]');
            await humanLikeWait(3000, 5000);
            // Using static selector for "no results" message
            if (document.body.innerText.includes("No messages matched your search")) {
                console.log(`Search returned no messages for sender ${sender}`);
                continue;
            }

            await processSearchResultsAndPaginate(settings,access_token,sender,email);
            console.log(`--- Finished processing for sender ${sender}`);
            await humanLikeWait(3000, 5000);

        }

        console.log("✅ ✅ ✅ Full sequence terminated normally!");
        alert(`Automation Finished.\n\nTotal emails processed: ${emailProcessOpnedCount}`);

    } catch (error) {
        if (error.message === "STOP_EXECUTION") {
            console.log("🛑 Automation stopped by user command.");
        } else {
            console.error("❌ The automation sequence FAILED:", error);
            alert("The automation sequence failed. Check the console for details.");
        }
    } finally {
        console.log("Resetting running state.");
        await chrome.storage.local.set({ isAutomationRunning: false });
    }
}

// ============================================================================
// ACTION SUB-FUNCTIONS
// ============================================================================

async function cleanSpamFolder(senders) {
    console.log("--- Starting Step 1: Cleaning Spam Folder ---");
    await checkIfStopped();

    let spamLink = document.querySelector('a[href$="#spam"]');
    if (!spamLink) {
        const moreButton = await waitForElement('div.TK .n6 span[role="button"]');
        simulateHumanClick(moreButton);
        spamLink = await waitForElement('a[href$="#spam"]');
    }
    simulateHumanClick(spamLink);
    await humanLikeWait(2000, 3000);

    const spamSearchQuery = `in:spam (${senders.map(s => `from:"${s}"`).join(' OR ')})`;
    await performSearch(spamSearchQuery);
    await humanLikeWait(2000, 3000);

    const noResultsElement = document.querySelector('td.TC');
    if (noResultsElement && (noResultsElement.textContent.includes("No messages matched your search") || noResultsElement.textContent.includes("You don't have any spam here"))) {
        console.log("No relevant emails found in spam. Skipping cleaning.");
    } else {
        const selectAllCheckbox = await waitForElements('span[role="checkbox"]');
        const lastCheckbox = selectAllCheckbox[selectAllCheckbox.length - 1];
        simulateHumanClick(lastCheckbox);

        await humanLikeWait();

        const notSpamButton = await waitForElement('div[role="button"][data-tooltip="Not spam"]');
        simulateHumanClick(notSpamButton);

        await waitForElement("div[role='alert']");
        console.log("Successfully moved relevant spam to inbox.");
        await humanLikeWait(1000, 1500);
    }

}

async function performSearch(query) {
    const searchBarSelector = 'input[aria-label="Search mail"]';
    const searchBar = await waitForElement(searchBarSelector);
    searchBar.value = query;
    searchBar.focus();
    searchBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    console.log(`Search executed for: ${query}`);
}

async function findAndClickCTA(settings,access_token,sender_name,email) {

    const ctaXpaths = settings.cta.gmail;
    if (!ctaXpaths || ctaXpaths.length === 0) {
        console.log("   No CTA selectors found in settings.");
        return false;
    }
    let cta_exist=false;
    for (const xpath of ctaXpaths) {
        const ctaButton = getElementByXPath(xpath);
        if (ctaButton && ctaButton.href) {
            cta_exist=true
            console.log(`   ✅ CTA Link FOUND for sender "${sender_name}". URL: ${ctaButton.href}`);
            // open tab and wait to close it
            try {
                const response = await chrome.runtime.sendMessage({ action: "openAndWait", url: ctaButton.href });
                if (response && response.status === "success") {
                    console.log("openAndWait Done");
                }
            }catch (e) {
                console.log("openAndWait failed to close automatically");
            }
        }
    }
    const response = await chrome.runtime.sendMessage({ action: "logger", access_token: access_token, sender: sender_name ,email: email });

    if (response && response.status === "error") {
        console.log(`Logger API error`);
        throw new Error("Logger API error");
    }
    if(cta_exist){
        return true
    }else {
        console.log("   No CTA button was found.");
        return false;
    }

}

async function processSearchResultsAndPaginate(settings,access_token,sender,email) {
    const firstEmailSelectors = await waitForElements('table[role="grid"] tr.zA:first-of-type');
    const firstEmail = firstEmailSelectors[firstEmailSelectors.length - 1];
    simulateHumanClick(firstEmail);

    const emailOpenIndicator = 'button[aria-label="Print all"]';
    await waitForElement(emailOpenIndicator);
    await humanLikeWait();

    while (true) {
        await checkIfStopped();
        console.log(`Processing email #${emailProcessOpnedCount + 1}...`);

        const subjectElement = document.querySelector('h2.hP');
        const currentSubject = subjectElement ? subjectElement.textContent : null;

        emailProcessOpnedCount++
        await findAndClickCTA(settings,access_token,sender,email);


        //const olderButton = document.querySelector('div[role="button"][data-tooltip="Older"]');

        const olderButtons = await waitForElements('div[role="button"][data-tooltip="Older"]');
        const olderButton = olderButtons[olderButtons.length - 1];


        if (!olderButton || olderButton.getAttribute('aria-disabled') === 'true') {
            console.log(`Reached the last email in this batch.`);
            break;
        }

        simulateHumanClick(olderButton);

        console.log("   Clicked 'Older', waiting for next email to load...");
        await new Promise((resolve, reject) => {
            const startTime = Date.now();
            const intervalId = setInterval(() => {
                const newSubjectElement = document.querySelector('h2.hP');
                const newSubject = newSubjectElement ? newSubjectElement.textContent : null;
                if (newSubject !== currentSubject) {
                    console.log("   Next email loaded.");
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
