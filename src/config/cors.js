const corsOptions = {
    origin: [
        'https://unobtrix.netlify.app',
        'https://unobtrix.netlify.app/signup',
        'https://unobtrix.netlify.app/customer.html',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:5000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400
};

module.exports = corsOptions;
