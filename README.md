<div align="center">
  <h1>🧠 ai-study-assistant</h1>
  <p>An interactive, AI-powered study platform built with Next.js. Transform static notes into an interactive learning experience with dynamic quizzes, voice Q&A, and inline annotations.</p>

  [![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)](https://reactjs.org/)
  [![TailwindCSS](https://img.shields.io/badge/Tailwind-3-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite)](https://sqlite.org/)
</div>

<br/>

## ✨ Features

- **📄 Document Upload & Markdown Viewer:** Easily upload your study notes and render them beautifully using Github-Flavored Markdown.
- **🎙️ Voice Q&A:** Talk to your notes! Use the built-in voice interface to ask questions out loud and get instant AI-generated answers.
- **📝 Floating Annotations & Comments:** Highlight text, drop comments inline, and interact directly with the material via our floating ask UI.
- **🧠 Dynamic Quiz Section:** Automatically generate quizzes based on your study materials to test your knowledge and retention.
- **🤖 Multi-LLM Support:** Flexible AI backend! You can run wholly local and private models via LlamaCPP or use top-tier cloud models like OpenAI, Anthropic, or Google Gemini.

---

## 🛠️ Tech Stack
- **Frontend:** Next.js 14 (App Router), React 18, TailwindCSS
- **Backend:** Next.js API Routes, SQLite (`study.db`)
- **AI Providers:** LlamaCPP (Local), OpenAI, Anthropic Claude, Google Gemini

---

## 🚦 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/namankumar941/ai-study-assistant.git
cd ai-study-assistant
```

### 2. Install dependencies
Make sure you have Node.js 18+ installed. 
```bash
npm install
```

### 3. Configure Environment Variables
You need to set up your AI provider. Create an `.env.local` file in the root directory. You can copy the structure below:

```env
# Choose your provider: llamacpp | anthropic | openai | gemini
LLM_PROVIDER=llamacpp

# === Option A: Run Local Models (LlamaCPP) ===
LLAMACPP_BASE_URL=http://localhost:8080
LLAMACPP_MODEL=qwen3.5:9b

# === Option B: Anthropic ===
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

# === Option C: OpenAI ===
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o

# === Option D: Google Gemini ===
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
```

### 4. Start the Application
Run the Next.js development server:
```bash
npm run dev
```

The app will now be running on [http://localhost:3000](http://localhost:3000).

> **Note for Local LLMs:** If you are using `LLM_PROVIDER=llamacpp`, make sure your local `llama-server` is up and running on port 8080 before trying to use the AI features in the app.

---

## 📂 Project Structure Snapshot
- `/components`: Includes all core modules like `QuizSection`, `MarkdownViewer`, `VoiceQA`, `FloatingAsk`.
- `/app`: Next.js 14 App Router layout, pages, and API handlers.
- `/data`: Storage for static datasets or database seeds.

## 🤝 Contributing
Contributions, issues and feature requests are welcome!

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request.
