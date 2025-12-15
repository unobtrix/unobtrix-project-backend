const requestLogger = (req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Origin:', req.headers.origin);
    if (req.method === 'POST' && req.body) {
        const bodyCopy = { ...req.body };
        if (bodyCopy.profile_photo_base64) {
            bodyCopy.profile_photo_base64 = `[BASE64_IMAGE:${bodyCopy.profile_photo_base64.length} chars]`;
        }
        if (bodyCopy.profile_photo_url) {
            bodyCopy.profile_photo_url = `[URL:${bodyCopy.profile_photo_url.substring(0, 50)}...]`;
        }
        if (bodyCopy.password) {
            bodyCopy.password = `[PASSWORD_HIDDEN]`;
        }
        if (bodyCopy.imageData) {
            bodyCopy.imageData = `[IMAGE_DATA:${bodyCopy.imageData.length} chars]`;
        }
        console.log('Body keys:', Object.keys(bodyCopy));
    }
    next();
};

module.exports = requestLogger;
