document.addEventListener('DOMContentLoaded', () => {
    try {
        initializeDarkMode();
        const paymentContainer = document.querySelector('.payment-container');
        if (!paymentContainer) {
            console.error('Payment container not found in DOM');
        } else {
            console.log('Payment container loaded successfully');
        }
    } catch (error) {
        console.error('Error initializing index.html:', error);
    }
});