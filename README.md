# 🌍 Wanderlust AI - Smart Travel Planner

An AI-powered travel planning application that creates personalized itineraries based on your preferences, budget, and luxury level.

## ✨ Features

- **Smart Itinerary Generation**: AI-powered travel plans using LLM via OpenRouter API
- **Transportation Planning**: Recommends flights, trains, or buses based on your budget
- **Accommodation Suggestions**: Curated stays matching your luxury preference
- **Daily Activities**: Detailed day-by-day sightseeing recommendations
- **Dining Recommendations**: Restaurant suggestions for each meal
- **Budget Breakdown**: Clear cost allocation across categories
- **Travel Tips**: Destination-specific advice and tips
- **Beautiful UI**: Modern, responsive design with smooth animations

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenRouter API key (get one at https://openrouter.ai/)

### Installation

1. **Clone or navigate to the project directory**

2. **Set up the Backend**
   ```bash
   cd backend
   npm install
   ```

3. **Set up the Frontend**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure Environment Variables**
   
   Edit the `.env` file in the root directory:
   ```env
   OPENROUTER_API_KEY=your_api_key_here
   LLM_MODEL=anthropic/claude-3.5-sonnet
   PORT=5000
   OLA_MAPS_API_KEY=your_ola_maps_api_key
   OLA_MAPS_CLIENT_ID=your_ola_maps_client_id
   OLA_MAPS_CLIENT_SECRET=your_ola_maps_client_secret
   OLA_MAPS_AUTH_MODE=api-key
   ```
   
   **Get your OpenRouter API key:**
   - Visit https://openrouter.ai/
   - Sign up for an account
   - Generate an API key
   - Replace `your_api_key_here` with your actual key

   **Popular LLM Models available on OpenRouter:**
   - `anthropic/claude-3.5-sonnet` (Recommended)
   - `openai/gpt-4o`
   - `google/gemini-pro-1.5`
   - `meta-llama/llama-3.1-70b-instruct` (Free option)

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd backend
   npm start
   ```
   The backend will run on `http://localhost:5000`

2. **Start the Frontend (in a new terminal)**
   ```bash
   cd frontend
   npm start
   ```
   The frontend will run on `http://localhost:3000`

3. **Open your browser** and navigate to `http://localhost:3000`

## 📖 How to Use

1. Enter your **departure city** (From)
2. Enter your **destination** (To)
3. Set your **total budget** in dollars
4. Choose the number of **days** for your trip
5. Select your **luxury level**:
   - 💰 **Budget**: Economical options, hostels, public transport
   - ⭐ **Mid-Range**: Comfortable hotels, mix of transport modes
   - 👑 **Luxury**: Premium experiences, flights, upscale stays
6. Click **"Generate Travel Plan"**
7. Wait for the AI to create your personalized itinerary!

## 🏗️ Project Structure

```
.
├── .env                      # ⚠️ Environment variables (UNTRACKED - contains sensitive API keys)
├── .gitignore               # Git ignore rules for sensitive files
├── README.md                # This file
├── backend/                 # Node.js/Express backend
│   ├── server.js            # Main server file
│   ├── routes/
│   │   ├── travel.js        # Travel planning routes
│   │   ├── agent.js         # Agent routes
│   │   └── ...
│   ├── services/
│   │   ├── llm.js           # LLM integration service
│   │   ├── ollamaClient.js  # Ollama provider
│   │   └── ...
│   ├── agents/              # AI agent implementations
│   │   ├── baseAgent.js
│   │   ├── emailAgent.js
│   │   └── ...
│   ├── scrapers/            # Data scraping utilities
│   └── package.json
├── frontend/                # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js           # Main React component
│   │   ├── components/      # React components
│   │   ├── services/        # Frontend services
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Page components
│   │   └── styles/          # CSS stylesheets
│   └── package.json
├── docs/                    # 📚 Documentation files (UNTRACKED)
│   ├── QUICK_START.md
│   ├── AGENT_SETUP_GUIDE.md
│   ├── ARCHITECTURE_DIAGRAMS.md
│   ├── WEB_SEARCH_API_GUIDE.md
│   └── ... (other guides)
├── tests/                   # 🧪 Test files (UNTRACKED)
│   └── test-agent.js
└── archive/                 # 📦 Archive files (UNTRACKED)
    ├── WhatsApp Video...
    └── ... (older test files)
```

**Legend:**
- ⚠️ = Contains sensitive information (never commit)
- 📚 = Documentation/guides (archived for clarity)
- 🧪 = Test and development files
- 📦 = Archive/backup files

## 💡 Suggestions for Enhancement

Here are some ideas to make this even better:

1. **Save/Export Plans**: Add functionality to save plans as PDF or share via email
2. **User Accounts**: Allow users to create accounts and save multiple trip plans
3. **Map Integration**: Integrate Google Maps or Mapbox to visualize the itinerary
4. **Weather Forecast**: Show weather predictions for the travel dates
5. **Currency Converter**: Auto-convert budget to local currency
6. **Booking Links**: Add direct links to book flights, hotels, and activities
7. **Multi-destination**: Support trips with multiple stops
8. **Travel Companion Preferences**: Solo, couple, family, or group travel options
9. **Interest Tags**: Filter activities by interests (adventure, culture, food, nature, etc.)
10. **Offline Mode**: Download plans for offline access during travel

## 🔧 Tech Stack

- **Frontend**: React, CSS3, Lucide Icons
- **Backend**: Node.js, Express
- **AI/ML**: OpenRouter API (supports multiple LLM providers)
- **Maps**: Google Places plus Ola Maps for India-first place and routing support
- **Styling**: Custom CSS with modern gradients and animations

## ⚠️ Security & File Organization

### 🔐 Sensitive Information

**CRITICAL**: Your `.env` file contains real API keys:
- ✅ `.env` is automatically **excluded from git** (see `.gitignore`)
- ✅ Never commit `.env` to version control
- ✅ All sensitive files are properly untracked
- ✅ Code correctly reads secrets from environment variables only

**Currently Untracked (Safe):**
- `.env` - API keys, tokens, secrets
- `docs/` - Documentation/guides (archived for clarity)
- `tests/` - Test files
- `archive/` - Media and old files

### 📁 Folder Organization

To improve maintainability, the following have been organized:
- **Documentation moved to `docs/`**: All `.md` guides and specifications
- **Test files in `tests/`**: Isolated test code
- **Archive folder**: Backup and old files

All are properly configured in `.gitignore` to prevent accidental commits.

### ✅ Security Checklist

- ✅ No hardcoded API keys in source code
- ✅ All secrets read from environment variables
- ✅ .env file tracked in .gitignore
- ✅ Sensitive folders excluded from git
- ✅ Code uses best practices for configuration

**Before deploying to production:**
1. Rotate all exposed API keys in `.env`
2. Use environment-specific .env files (.env.production)
3. Implement secrets management system (AWS Secrets Manager, Vault, etc.)
4. Enable branch protection on main branch
5. Set up pre-commit hooks to check for secrets

## 📝 License

This project is open source and available for personal and educational use.

## 🤝 Support

If you encounter any issues:
1. Check that your OpenRouter API key is correct
2. Ensure both backend and frontend servers are running
3. Check the browser console and terminal for error messages
4. Verify that all dependencies are installed

---

**Happy Travels! 🌴✈️**
