# 🚀 Quick Setup Guide for SyncScript

## For Windows Users with PowerShell Restrictions

If you encounter PowerShell execution policy errors when running npm commands, follow these steps:

### Option 1: Temporary PowerShell Policy Change (Recommended)
Open PowerShell as Administrator and run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Option 2: Use Command Prompt Instead
Use `cmd.exe` instead of PowerShell to run npm commands.

### Option 3: Manual Dependency Installation
If npm still doesn't work, you can manually install dependencies:

#### Backend Dependencies
```bash
cd backend
npm install express cors
npm install --save-dev nodemon
```

#### Frontend Dependencies
```bash
cd frontend
npm install react react-dom
npm install --save-dev vite @vitejs/plugin-react
```

---

## Running the Application

### Step 1: Start the Backend
Open a terminal (PowerShell or CMD):
```bash
cd backend
node server.js
```

You should see:
```
🚀 SyncScript API running on http://localhost:3000
📝 Health check: http://localhost:3000/
```

### Step 2: Start the Frontend
Open a **second** terminal:
```bash
cd frontend
npm run dev
```

You should see:
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### Step 3: Open in Browser
Navigate to: **http://localhost:5173**

---

## Troubleshooting

### Backend won't start
- **Error:** `Cannot find module 'express'`
- **Solution:** Run `npm install` in the `backend` directory

### Frontend won't start
- **Error:** `Cannot find module 'vite'`
- **Solution:** Run `npm install` in the `frontend` directory

### CORS errors in browser
- **Error:** `Access to fetch at 'http://localhost:3000' blocked by CORS`
- **Solution:** Make sure the backend is running on port 3000

### Port already in use
- **Error:** `EADDRINUSE: address already in use :::3000`
- **Solution:** Kill the process using that port or change the port in the code

---

## Testing the Demo

1. **Create a vault:** Enter a name and click "Create"
2. **Add sources:** Select the vault, enter title and URL, click "Add Source"
3. **Test real-time sync:** Open a second browser tab, add a source in one tab, wait 3 seconds, see it appear in the other tab

---

## Project Structure Verification

Your project should look like this:
```
Project/
├── README.md
├── SETUP.md (this file)
├── backend/
│   ├── package.json
│   ├── server.js
│   └── node_modules/ (after npm install)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   └── node_modules/ (after npm install)
```

---

## Next Steps

Once everything is running:
1. Read the **README.md** for architecture details
2. Review the **7-minute demo script** in the README
3. Explore the code comments explaining production patterns
4. Check the data model and scalability sections

---

## Need Help?

- Backend not responding? Check if it's running on http://localhost:3000
- Frontend not loading? Check if Vite dev server is running on http://localhost:5173
- Still stuck? Review the comprehensive README.md for more details

Happy demoing! 🎉
