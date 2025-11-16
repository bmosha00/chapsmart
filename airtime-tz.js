const USD_TO_TZS_RATE = 2390;
let bitcoinPriceInUSDT = 75000; // Default fallback Bitcoin price in USDT
const MAX_API_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
let timerInterval;

// Generate a unique transaction ID (used end-to-end)
function generateTxId() {
    return `TX_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Display form messages (error or success)
function displayMessage(message, type = 'error') {
    const messageBox = document.getElementById('formMessages');
    if (!messageBox) return;
    messageBox.textContent = message;
    messageBox.className = type === 'success' ? 'success' : 'error';
    setTimeout(() => {
        messageBox.textContent = '';
        messageBox.className = '';
    }, 8000);
}

// Fetch current Bitcoin price (Binance / OKX)
async function fetchBitcoinPrice(attempt = 1, useBinance = true) {
    const apiUrl = useBinance
        ? 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
        : 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT';
    const source = useBinance ? 'Binance' : 'OKX';

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        bitcoinPriceInUSDT = parseFloat(useBinance ? data.price : data.data[0].last);
        console.log(`Fetched Bitcoin price from ${source}:`, bitcoinPriceInUSDT);
    } catch (error) {
        console.error(`Attempt ${attempt} failed on ${source}:`, error);
        if (attempt < MAX_API_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchBitcoinPrice(attempt + 1, useBinance);
        } else if (useBinance) {
            return fetchBitcoinPrice(1, false);
        } else {
            console.error("Using fallback BTC price after retries:", error);
            displayMessage("Failed to fetch Bitcoin price. Using fallback price.");
        }
    }
}

// Validate and calculate amount (TZS to SATS)
function validateAndCalculateAmount() {
    const input = document.getElementById('amount');
    const satoshiElement = document.getElementById('satoshi-amount');
    const tzsElement = document.getElementById('recipient-amount');
    if (!input || !satoshiElement || !tzsElement) {
        displayMessage("Form setup error.");
        return { isValid: false, tzsAmount: 0, amountSats: 0 };
    }

    const tzsAmount = parseFloat(input.value);
    input.classList.remove('valid', 'invalid');
    satoshiElement.textContent = '0 SATS';
    tzsElement.textContent = '0 TZS';

    if (input.value.trim() !== '' && isNaN(tzsAmount)) {
        input.classList.add('invalid');
        displayMessage("Amount must be a number.");
        return { isValid: false, tzsAmount: 0, amountSats: 0 };
    }
    if (tzsAmount < 500 || tzsAmount > 5000) {
        input.classList.add('invalid');
        displayMessage("Amount must be between 500 and 5000 TZS.");
        return { isValid: false, tzsAmount: 0, amountSats: 0 };
    }

    const usdAmount = tzsAmount / USD_TO_TZS_RATE;
    let amountSats = Math.round((usdAmount * 100000000) / bitcoinPriceInUSDT);
    amountSats = Math.round(amountSats * 1.0537); // Add 5.37% fee
    tzsElement.textContent = tzsAmount.toLocaleString() + ' TZS';
    satoshiElement.textContent = amountSats.toLocaleString() + ' SATS';
    input.classList.add('valid');
    return { isValid: true, tzsAmount, amountSats };
}

// Validate Tanzanian phone number
function formatPhoneNumber() {
    const input = document.getElementById('phoneNumber');
    if (!input) {
        displayMessage("Form setup error.");
        return false;
    }
    let number = input.value.replace(/\D/g, '');
    input.classList.remove('valid', 'invalid');

    if (!number.startsWith('255') || number.length !== 12) {
        input.classList.add('invalid');
        displayMessage("Phone must start with 255 and be 12 digits.");
        return false;
    }
    input.value = '+' + number;
    input.classList.add('valid');
    return number;
}

// Format time as MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Show Lightning invoice popup
function showPaymentPopup(paymentRequest, amountSats) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.id = 'paymentPopup';
    popup.innerHTML = `
        <div class="popup-content">
            <span class="popup-close">&times;</span>
            <h3 class="popup-title">Pay with Lightning</h3>
            <div class="popup-amount">Amount: <span>${amountSats.toLocaleString()} SATS</span></div>
            <div class="popup-qrcode">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentRequest)}" alt="Lightning Invoice QR Code">
            </div>
            <div class="popup-invoice">
                <textarea readonly>${paymentRequest}</textarea>
                <button id="copyInvoiceButton" class="btn btn-primary">Copy Invoice</button>
            </div>
            <div class="popup-status">Waiting for payment confirmation...</div>
            <div class="popup-timer">Time remaining: <span id="timer">${formatTime(13 * 60)}</span></div>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('active'), 50);

    const copyButton = popup.querySelector('#copyInvoiceButton');
    copyButton.addEventListener('click', () => {
        const text = popup.querySelector('textarea');
        text.select();
        document.execCommand('copy');
        displayMessage('Invoice copied!', 'success');
    });

    let timeLeft = 13 * 60;
    const timer = popup.querySelector('#timer');
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timer.textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            popup.remove();
            showTimeoutPopup();
        }
    }, 1000);

    popup.querySelector('.popup-close').addEventListener('click', () => {
        popup.remove();
        clearInterval(timerInterval);
    });
}

// Show success popup (MISSING FUNCTION ADDED)
function showSuccessPopup(transactionData) {
    const { amountSats, phoneNumber, amount } = transactionData;
    const popup = document.createElement('div');
    popup.className = 'popup success';
    popup.innerHTML = `
        <div class="popup-content">
            <span class="popup-close">&times;</span>
            <h3 class="popup-title">Payment Successful!</h3>
            <div class="popup-status">Airtime payment has been successfully initiated.</div>
            <div class="popup-details">
                <p><strong>Amount (SATS):</strong> ${amountSats.toLocaleString()} SATS</p>
                <p><strong>Amount (TZS):</strong> ${amount.toLocaleString()} TZS</p>
                <p><strong>Recipient Phone:</strong> +${phoneNumber}</p>
            </div>
            <button id="closeSuccessButton" class="btn btn-primary">Close</button>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('active'), 50);

    // Auto close after 10 seconds
    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
        setTimeout(() => {
            popup.remove();
            location.reload();
        }, 300);
    }, 10000);

    // Manual close handlers
    popup.querySelector('.popup-close').addEventListener('click', () => {
        popup.remove();
        location.reload();
    });

    popup.querySelector('#closeSuccessButton').addEventListener('click', () => {
        popup.remove();
        location.reload();
    });
}

// Timeout popup
function showTimeoutPopup() {
    const popup = document.createElement('div');
    popup.className = 'popup error';
    popup.innerHTML = `
        <div class="popup-content">
            <h3 class="popup-title">Payment Timed Out</h3>
            <div class="popup-status">Please try again.</div>
            <button id="tryAgainButton" class="btn btn-primary">Try Again</button>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('active'), 50);
    document.getElementById('tryAgainButton').addEventListener('click', () => {
        popup.remove();
        location.reload();
    });
}

// Beem error popup
function showBeemErrorPopup(msg) {
    const popup = document.createElement('div');
    popup.className = 'popup error';
    popup.innerHTML = `
        <div class="popup-content">
            <h3 class="popup-title">Airtime Transfer Failed</h3>
            <div class="popup-status">${msg}</div>
            <button id="tryAgainButton" class="btn btn-primary">Try Again</button>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('active'), 50);
    document.getElementById('tryAgainButton').addEventListener('click', () => {
        popup.remove();
        location.reload();
    });
}

// === Save transaction to Firebase (with txId) ===
async function saveToFirebase(transactionData) {
    try {
        console.log("Saving to Firebase:", transactionData);
        const res = await fetch('/.netlify/functions/firebaseairtime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'addTransaction',
                data: {
                    ...transactionData,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                }
            })
        });

        console.log("Firebase response status:", res.status);
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Firebase save failed: ${errorText || res.statusText}`);
        }

        const data = await res.json();
        console.log("Firebase response data:", data);
        return data;
    } catch (error) {
        console.error("Firebase save error:", error);
        throw error;
    }
}

// === Trigger Beem (with improved error handling) ===
async function processBeemTransaction(firebaseDocId, txId, attempt = 1) {
    try {
        console.log(`🔵 Beem attempt ${attempt} for doc:`, firebaseDocId);
        
        const res = await fetch('/.netlify/functions/beem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'processTransaction', 
                docId: firebaseDocId 
            })
        });

        console.log(`🔵 Beem response status:`, res.status);
        
        // Handle response parsing safely
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Invalid JSON response: ${text}`);
        }

        console.log(`🔵 Beem response data:`, data);

        if (!res.ok) {
            throw new Error(data.error || data.message || `HTTP ${res.status}`);
        }

        if (data.status !== 'success') {
            throw new Error(data.message || data.error || 'Beem transaction failed');
        }

        return data;
        
    } catch (err) {
        console.error(`❌ Beem attempt ${attempt} failed:`, err.message);
        if (attempt < MAX_API_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return processBeemTransaction(firebaseDocId, txId, attempt + 1);
        }
        throw err;
    }
}

// === Poll Lightning invoice ===
async function pollInvoiceStatus(paymentHash, transactionData) {
    const maxTime = 13 * 60 * 1000; // 13 minutes
    const pollInterval = 5000; // 5 seconds
    const start = Date.now();

    while (Date.now() - start < maxTime) {
        try {
            const res = await fetch('/.netlify/functions/airtime-alby', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'checkInvoice', invoiceId: paymentHash })
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`Poll failed: ${res.status} - ${errorText}`);
                // Continue polling on temporary errors
                await new Promise(r => setTimeout(r, pollInterval));
                continue;
            }

            const data = await res.json();
            console.log("Invoice status:", data);
            
            if (data.settled) {
                const popup = document.getElementById('paymentPopup');
                if (popup) {
                    popup.remove();
                    clearInterval(timerInterval);
                }

                try {
                    const firebaseRes = await saveToFirebase(transactionData);
                    await processBeemTransaction(firebaseRes.id, transactionData.txId);
                    showSuccessPopup(transactionData);
                    return true;
                } catch (beemError) {
                    console.error("Beem processing failed:", beemError.message);
                    showBeemErrorPopup(beemError.message);
                    return false;
                }
            }
        } catch (error) {
            console.error("Polling error:", error.message);
            // Continue polling on network errors
        }

        await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error('Payment confirmation timed out after 13 minutes.');
}

// === Create Lightning invoice and start process ===
async function processPayment(amountSats, phoneNumber, tzsAmount) {
    const txId = generateTxId();
    console.log('Generated TX_ID:', txId);

    const res = await fetch('/.netlify/functions/airtime-alby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'createInvoice',
            amount: amountSats,
            memo: `Airtime TX:${txId} for ${phoneNumber}`
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create invoice: ${errorText || res.statusText}`);
    }

    const invoice = await res.json();
    console.log("Invoice response:", invoice);

    if (!invoice.payment_request || !invoice.payment_hash) {
        throw new Error("Invalid invoice response: missing payment_request or payment_hash");
    }

    const transactionData = {
        txId,
        amountSats,
        amount: tzsAmount,
        phoneNumber,
        invoice: invoice.payment_request,
        paymentHash: invoice.payment_hash,
        timestamp: new Date().toISOString()
    };

    showPaymentPopup(invoice.payment_request, amountSats);
    await pollInvoiceStatus(invoice.payment_hash, transactionData);
}

// === Handle form submit ===
async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.querySelector('.btn-primary');
    if (!btn) {
        displayMessage("Submit button not found.");
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const { isValid, amountSats, tzsAmount } = validateAndCalculateAmount();
        const phone = formatPhoneNumber();
        
        if (!isValid || !phone) {
            displayMessage('Please fix the errors above.');
            return;
        }
        
        await processPayment(amountSats, phone, tzsAmount);
        displayMessage('Invoice created. Scan or copy to pay.', 'success');
    } catch (err) {
        console.error("Submission error:", err);
        if (err.message.includes("timed out")) {
            showTimeoutPopup();
        } else if (err.message.includes("Beem")) {
            showBeemErrorPopup(err.message);
        } else {
            displayMessage(`Error: ${err.message}`);
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Submit';
    }
}

// === Initialize application ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Initializing Airtime TZ application...");
    
    try {
        await fetchBitcoinPrice();
    } catch (error) {
        console.error("Failed to fetch Bitcoin price:", error);
    }

    const form = document.getElementById('beemForm');
    const amountInput = document.getElementById('amount');
    const phoneInput = document.getElementById('phoneNumber');

    if (!form || !amountInput || !phoneInput) {
        console.error("Required form elements not found");
        displayMessage("Form setup error. Please refresh the page.");
        return;
    }

    amountInput.addEventListener('input', validateAndCalculateAmount);
    phoneInput.addEventListener('input', formatPhoneNumber);
    form.addEventListener('submit', handleSubmit);

    // Update Bitcoin price every 15 seconds
    setInterval(async () => {
        try {
            await fetchBitcoinPrice();
            validateAndCalculateAmount();
        } catch (error) {
            console.error("Price update error:", error);
        }
    }, 15000);

    // Initial calculation
    validateAndCalculateAmount();
});