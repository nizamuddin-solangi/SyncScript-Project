
const axios = require('axios');
const FormData = require('form-data');

async function test() {
    const baseURL = 'http://localhost:3000';

    try {
        // 1. Register/Login
        const email = `test${Date.now()}@example.com`;
        let authRes;
        try {
            authRes = await axios.post(`${baseURL}/auth/register`, {
                email,
                password: 'password123',
                name: 'Test User'
            });
        } catch (e) {
            authRes = await axios.post(`${baseURL}/auth/login`, {
                email,
                password: 'password123'
            });
        }

        // Handle both potential structures
        const token = authRes.data.token || (authRes.data.data && authRes.data.data.token);
        console.log('Got token:', token ? 'Yes' : 'No');

        // 2. Create Vault
        const vaultRes = await axios.post(`${baseURL}/vaults`, {
            name: 'Debug Vault V2'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const vaultId = vaultRes.data.data.id;
        console.log('Created vault:', vaultId);

        // 3. Add "Note" Source (FormData)
        console.log('Adding Note source (FormData)...');
        const form = new FormData();
        form.append('title', 'FormData Note Title');
        form.append('type', 'note');
        form.append('content', 'This is a test note content from FormData');

        const headers = {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders()
        };

        const sourceRes = await axios.post(`${baseURL}/vaults/${vaultId}/sources`, form, {
            headers
        });

        console.log('Add Note Source Result:', sourceRes.data.success ? 'Success' : 'Failed');

        // 4. Add "File" Source (FormData)
        console.log('Adding File source (FormData)...');
        const fileForm = new FormData();
        fileForm.append('title', 'Test Image File');
        fileForm.append('type', 'image');
        // Simulate a small image file
        fileForm.append('file', Buffer.from('fake-image-data'), {
            filename: 'test-image.jpg',
            contentType: 'image/jpeg'
        });

        const fileHeaders = {
            Authorization: `Bearer ${token}`,
            ...fileForm.getHeaders()
        };

        const fileSourceRes = await axios.post(`${baseURL}/vaults/${vaultId}/sources`, fileForm, {
            headers: fileHeaders
        });

        console.log('Add File Source Result:', fileSourceRes.data.success ? 'Success' : 'Failed');
        console.log('Content path:', fileSourceRes.data.data.content);

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
