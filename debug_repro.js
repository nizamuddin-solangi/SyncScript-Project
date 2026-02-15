
const axios = require('axios');
const FormData = require('form-data'); // You might need to install this: npm install form-data
// If form-data is not available in the environment, we might need a different approach or rely on node's native fetch if available (Node 18+)

async function test() {
    const baseURL = 'http://localhost:3000';

    try {
        // 1. Register/Login
        const email = `test${Date.now()}@example.com`;
        console.log(`Registering user: ${email}`);

        let authRes;
        try {
            authRes = await axios.post(`${baseURL}/auth/register`, {
                email,
                password: 'password123',
                name: 'Test User'
            });
        } catch (e) {
            // If register fails, try login (in case I run it multiple times with same logic, though I used unique email)
            console.log('Register failed, trying login...');
            authRes = await axios.post(`${baseURL}/auth/login`, {
                email,
                password: 'password123'
            });
        }

        const token = authRes.data.token;
        console.log('Got token:', token ? 'Yes' : 'No');

        // 2. Create Vault
        console.log('Creating vault...');
        const vaultRes = await axios.post(`${baseURL}/vaults`, {
            name: 'Debug Vault'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const vaultId = vaultRes.data.data.id;
        console.log('Created vault:', vaultId);

        // 3. Add "Note" Source (Multipart without file)
        console.log('Adding Note source...');
        const form = new FormData();
        form.append('title', 'Test Note Title');
        form.append('type', 'note');
        form.append('content', 'This is a test note content');

        // Headers for form-data
        const headers = {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders()
        };

        const sourceRes = await axios.post(`${baseURL}/vaults/${vaultId}/sources`, form, {
            headers
        });

        console.log('Add Source Result:', sourceRes.data);

    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

test();
