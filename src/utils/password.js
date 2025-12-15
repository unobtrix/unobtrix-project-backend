const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    try {
        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password provided for hashing');
        }

        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        console.log('🔐 Hashing password for user registration...');
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (!hashedPassword || !hashedPassword.startsWith('$2a$')) {
            throw new Error('Failed to generate valid bcrypt hash');
        }

        console.log('✅ Password hashed successfully (length:', hashedPassword.length, ')');
        return hashedPassword;
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error(`Password hashing failed: ${error.message}`);
    }
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hashedPassword) {
    try {
        if (!password || !hashedPassword) {
            console.log('❌ Missing password or hash for verification');
            return false;
        }

        if (typeof password !== 'string' || typeof hashedPassword !== 'string') {
            console.log('❌ Invalid password or hash type for verification');
            return false;
        }

        if (!hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$') && !hashedPassword.startsWith('$2y$')) {
            console.log('❌ Stored password is not a valid bcrypt hash - possible plain text password');
            const isPlainTextMatch = password === hashedPassword;
            if (isPlainTextMatch) {
                console.error('🚨 SECURITY ISSUE: Plain text password found in database! User:', hashedPassword);
            }
            return isPlainTextMatch;
        }

        console.log('🔐 Verifying password against stored hash...');
        const isValid = await bcrypt.compare(password, hashedPassword);

        if (isValid) {
            console.log('✅ Password verification successful');
        } else {
            console.log('❌ Password verification failed');
        }

        return isValid;
    } catch (error) {
        console.error('❌ Error verifying password:', error);
        return false;
    }
}

/**
 * Migrate plain text passwords to hashed passwords
 * @returns {Promise<void>}
 */
async function migratePlainTextPasswords() {
    try {
        console.log('🔄 Checking for plain text passwords that need migration...');

        // Check consumers table
        const { data: consumers, error: cError } = await supabase
            .from('consumers')
            .select('id, email, password');

        if (!cError && consumers) {
            let migratedCount = 0;
            for (const user of consumers) {
                if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$') && !user.password.startsWith('$2y$')) {
                    console.log(`🔄 Migrating consumer ${user.email} from plain text to hash`);
                    const hashedPassword = await hashPassword(user.password);
                    await supabase
                        .from('consumers')
                        .update({ password: hashedPassword })
                        .eq('id', user.id);
                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`✅ Migrated ${migratedCount} consumer passwords`);
            }
        }

        // Check farmers table
        const { data: farmers, error: fError } = await supabase
            .from('farmers')
            .select('id, email, password');

        if (!fError && farmers) {
            let migratedCount = 0;
            for (const user of farmers) {
                if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$') && !user.password.startsWith('$2y$')) {
                    console.log(`🔄 Migrating farmer ${user.email} from plain text to hash`);
                    const hashedPassword = await hashPassword(user.password);
                    await supabase
                        .from('farmers')
                        .update({ password: hashedPassword })
                        .eq('id', user.id);
                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`✅ Migrated ${migratedCount} farmer passwords`);
            }
        }

        console.log('✅ Password migration check completed');
    } catch (error) {
        console.error('❌ Error during password migration:', error);
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    migratePlainTextPasswords
};
