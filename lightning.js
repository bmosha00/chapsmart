/* --------------------------------------------------------------
   lightning.js – TZS Input + 3% Fee (UI only) + Clean Firestore Save
   -------------------------------------------------------------- */
const USD_TO_TZS_RATE = 2403;
const FEE_PERCENT = 3;                      // 3% fee on satoshis (user pays)
let bitcoinPriceInUSDT = 70000;
const MAX_API_RETRIES = 3;
const RETRY_DELAY = 2000;

const VALID_Mpesa_PREFIXES = [
    '740', '741', '742', '743', '744', '745', '746', '747', '748', '749',
    '750', '752', '753', '754', '755', '756', '757', '758', '759', '760',
    '761', '762', '763', '764', '765', '766', '767', '768', '769',
    '790', '791', '792', '793', '794', '795'
];

let timerInterval;

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

// Bitcoin price fetch (unchanged)
async function fetchBitcoinPriceFromBinance() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return parseFloat(data.price);
    } catch (error) {
        console.error("Binance API failed:", error);
        throw error;
    }
}

async function fetchBitcoinPriceFromOKX() {
    try {
        const response = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        if (data.code === '0' && data.data && data.data[0]) {
            return parseFloat(data.data[0].last);
        } else {
            throw new Error(`OKX API error: ${data.msg || 'Invalid response'}`);
        }
    } catch (error) {
        console.error("OKX API failed:", error);
        throw error;
    }
}

async function fetchBitcoinPrice(attempt = 1) {
    try {
        let price = await fetchBitcoinPriceFromBinance();
        bitcoinPriceInUSDT = price;
        return;
    } catch (binanceError) {
        try {
            let price = await fetchBitcoinPriceFromOKX();
            bitcoinPriceInUSDT = price;
            return;
        } catch (okxError) {
            if (attempt < MAX_API_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY));
                return fetchBitcoinPrice(attempt + 1);
            } else {
                displayMessage("Using fallback Bitcoin price.");
            }
        }
    }
}

// === VALIDATE & CALCULATE (with 3% fee in UI only) ===
function validateAndCalculateAmount() {
    const input = document.getElementById('amount');
    const errorElement = document.getElementById('amountError');
    const satoshiElement = document.getElementById('satoshi-amount');
    const tzsElement = document.getElementById('recipient-amount');

    const tzsAmount = parseFloat(input.value);

    // Reset
    input.classList.remove('valid', 'invalid');
    errorElement.className = 'error';
    errorElement.textContent = '';
    satoshiElement.textContent = '0 SATS';
    tzsElement.textContent = '0 TZS';

    if (isNaN(tzsAmount)) {
        errorElement.textContent = "Amount must be a valid number.";
        input.classList.add('invalid');
        return { isValid: false };
    }
    if (tzsAmount <= 0) {
        errorElement.textContent = "Amount is required.";
        input.classList.add('invalid');
        return { isValid: false };
    }

    const MIN_TZS = 2500, MAX_TZS = 350000;
    if (tzsAmount < MIN_TZS) {
        errorElement.textContent = "Amount must be at least 2,500 TZS.";
        input.classList.add('invalid');
        return { isValid: false };
    }
    if (tzsAmount > MAX_TZS) {
        errorElement.textContent = "Amount cannot exceed 350,000 TZS.";
        input.classList.add('invalid');
        return { isValid: false };
    }

    // === Calculate base SATS (no fee) ===
    const usdEquivalent = tzsAmount / USD_TO_TZS_RATE;
    const baseSats = Math.round((usdEquivalent * 100_000_000) / bitcoinPriceInUSDT);

    // === Apply 3% fee for invoice (user pays) ===
    const totalSats = Math.round(baseSats * 1.03);

    // === Update UI ===
    tzsElement.textContent = tzsAmount.toLocaleString() + ' TZS';
    satoshiElement.textContent = totalSats.toLocaleString() + ' SATS';
    input.classList.add('valid');
    errorElement.textContent = `Valid `;
    errorElement.className = 'valid';

    return { isValid: true, tzsAmount, amountSats: baseSats, totalSats };
}

// Validation (unchanged)
function validateMpesaName() {
    const input = document.getElementById('name');
    const errorElement = document.getElementById('mpesaNameError');
    const words = input.value.trim().split(/\s+/).filter(w => w);
    input.classList.remove('valid', 'invalid');
    errorElement.className = 'error';
    errorElement.textContent = '';
    if (words.length < 2) {
        errorElement.textContent = "M-Pesa name must contain at least 2 names.";
        input.classList.add('invalid');
        return false;
    } else {
        input.classList.add('valid');
        errorElement.textContent = "Name is valid.";
        errorElement.className = 'valid';
        return true;
    }
}

function formatMpesaNumber() {
    const input = document.getElementById('phone');
    const errorElement = document.getElementById('mpesaError');
    let number = input.value.replace(/\D/g, '');
    input.classList.remove('valid', 'invalid');
    errorElement.className = 'error';
    errorElement.textContent = '';
    if (number.startsWith('255') && number.length > 3) number = number.substring(3);
    if (number.length === 9) number = '0' + number;
    if (number.length !== 10 || !number.startsWith('0')) {
        errorElement.textContent = "Phone number must be 10 digits starting with 0.";
        input.classList.add('invalid');
        return false;
    }
    const prefix = number.substring(1, 4);
    if (!VALID_Mpesa_PREFIXES.includes(prefix)) {
        errorElement.textContent = "Not an M-Pesa number.";
        input.classList.add('invalid');
        return false;
    }
    input.value = number;
    input.classList.add('valid');
    errorElement.textContent = "Phone number is valid.";
    errorElement.className = 'valid';
    return number;
}

function validateDescription() {
    const input = document.getElementById('description');
    const errorElement = document.getElementById('descriptionError');
    const desc = input.value.trim();
    input.classList.remove('valid', 'invalid');
    errorElement.className = 'error';
    errorElement.textContent = '';
    if (desc.length > 100) {
        errorElement.textContent = "Description too long.";
        input.classList.add('invalid');
        return false;
    }
    input.classList.add('valid');
    errorElement.textContent = desc ? "Valid" : "Optional";
    errorElement.className = 'valid';
    return true;
}

// Popups
function showPaymentPopup(paymentRequest, totalSats) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.id = 'paymentPopup';
    popup.innerHTML = `
        <span class="close">×</span>
        <h3>Pay with Lightning</h3>
        <p>Amount: <span id="popupAmount">${totalSats.toLocaleString()} SATS</span></p>
        <textarea id="popupInvoice" readonly>${paymentRequest}</textarea>
        <button id="copyInvoiceButton" class="btn btn-secondary">Copy Invoice</button>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentRequest)}">
        <p>Waiting for payment...</p>
        <p id="timer"></p>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.style.opacity = '1', 50);

    document.getElementById('copyInvoiceButton').onclick = () => {
        document.getElementById('popupInvoice').select();
        document.execCommand('copy');
        displayMessage('Copied!', 'success');
    };

    let timeLeft = 13 * 60;
    const timer = document.getElementById('timer');
    timer.textContent = formatTime(timeLeft);
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

    popup.querySelector('.close').onclick = () => {
        popup.remove();
        clearInterval(timerInterval);
    };
}

function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

function showSuccessPopup({ amountSats, mpesaName, phoneNumber }) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <div class="popup-success-icon"><i class="fab fa-bitcoin"></i></div>
        <h3>Payment Successful!</h3>
        <p class="popup-success-message">Bitcoin received and sent to recipient.</p>
        <div class="popup-success-details">
            <p><strong>Amount:</strong> ${amountSats.toLocaleString()} SATS</p>
            <p><strong>Recipient:</strong> ${mpesaName}</p>
            <p><strong>M-Pesa:</strong> ${phoneNumber}</p>
        </div>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.style.opacity = '1', 50);
    setTimeout(() => {
        popup.style.opacity = '0';
        setTimeout(() => { popup.remove(); location.reload(); }, 300);
    }, 10000);
}

function showTimeoutPopup() {
    const popup = document.createElement('div');
    popup.className = 'popup error';
    popup.innerHTML = `Time expired.<br><button id="tryAgainButton">Try Again</button>`;
    document.body.appendChild(popup);
    document.getElementById('tryAgainButton').onclick = () => {
        popup.remove();
        location.reload();
    };
}

// Firebase save – CLEAN DATA ONLY
async function saveToFirebase(transactionData) {
    const cleanData = {
        amount: transactionData.amount,           // TZS
        amountSats: transactionData.amountSats,   // base SATS (no fee)
        description: transactionData.description,
        mpesaName: transactionData.mpesaName,
        phoneNumber: transactionData.phoneNumber,
        invoice: transactionData.invoice,
        paymentHash: transactionData.paymentHash,
        timestamp: new Date().toISOString(),
        transactionId: transactionData.transactionId
    };

    try {
        const response = await fetch('/.netlify/functions/firebase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'addTransaction', data: cleanData })
        });
        if (!response.ok) throw new Error(await response.text());
        return await response.json();
    } catch (error) {
        console.error("Firebase save failed:", error);
        throw error;
    }
}

// Alby
async function pollInvoiceStatus(paymentHash, totalSats, transactionData) {
    const start = Date.now();
    while (Date.now() - start < 13 * 60 * 1000) {
        try {
            const res = await fetch('/.netlify/functions/alby', {
                method: 'POST',
                body: JSON.stringify({ action: 'checkInvoice', invoiceId: paymentHash })
            });
            const data = await res.json();
            if (data.settled) {
                document.getElementById('paymentPopup')?.remove();
                clearInterval(timerInterval);
                await saveToFirebase(transactionData);
                showSuccessPopup(transactionData);
                return;
            }
        } catch (e) { console.error(e); }
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error("Timeout");
}

async function processPayment(transactionData) {
    const { totalSats, description } = transactionData;
    const res = await fetch('/.netlify/functions/alby', {
        method: 'POST',
        body: JSON.stringify({
            action: 'createInvoice',
            amount: totalSats,
            memo: description || 'ChapSmart Payment'
        })
    });
    const invoice = await res.json();
    if (!invoice.payment_request || !invoice.payment_hash) throw new Error("Invalid invoice");

    transactionData.invoice = invoice.payment_request;
    transactionData.paymentHash = invoice.payment_hash;

    await saveToFirebase(transactionData);
    showPaymentPopup(invoice.payment_request, totalSats);
    await pollInvoiceStatus(invoice.payment_hash, totalSats, transactionData);
}

// Submit
async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submit');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const amountResult = validateAndCalculateAmount();
        if (!amountResult.isValid) throw new Error("Invalid amount");

        const { tzsAmount, amountSats, totalSats } = amountResult;
        if (!validateMpesaName() || !formatMpesaNumber() || !validateDescription()) {
            throw new Error("Validation failed");
        }

        const transactionId = `TX_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const mpesaName = document.getElementById('name').value.trim();
        const phoneNumber = document.getElementById('phone').value;
        const description = document.getElementById('description').value.trim() || `ChapSmart Payment to ${mpesaName}`;

        const transactionData = {
            amount: tzsAmount,
            amountSats,           // base SATS (no fee)
            totalSats,            // with 3% fee (for invoice)
            description,
            mpesaName,
            phoneNumber,
            transactionId
        };

        await processPayment(transactionData);
        displayMessage(`Invoice created: ${transactionId}`, 'success');
    } catch (error) {
        if (error.message.includes("Timeout")) showTimeoutPopup();
        else displayMessage(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Submit';
    }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await fetchBitcoinPrice();
    const els = {
        amount: document.getElementById('amount'),
        phone: document.getElementById('phone'),
        name: document.getElementById('name'),
        desc: document.getElementById('description'),
        form: document.getElementById('paymentForm')
    };
    els.amount.addEventListener('input', validateAndCalculateAmount);
    els.phone.addEventListener('input', formatMpesaNumber);
    els.name.addEventListener('input', validateMpesaName);
    els.desc.addEventListener('input', validateDescription);
    els.form.addEventListener('submit', handleSubmit);

    setInterval(async () => {
        await fetchBitcoinPrice();
        validateAndCalculateAmount();
    }, 15000);

    validateAndCalculateAmount();
});