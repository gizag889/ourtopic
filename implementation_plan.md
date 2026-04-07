# Opinion Topography AI App - MVP Implementation Plan

This document outlines the proposed implementation plan to automate the flow of taking a news topic, fetching opinions from X (Twitter), analyzing them with AI using `exview.md` as the prompt, and displaying the conflicting axes to the user.

## Proposed Changes

We will build a full-stack Next.js feature using API routes to handle the external requests securely, and a beautiful front-end to display the results.

### 1. Dependencies and Environment Setup
- **AI Integration**: Install `ai` (Vercel AI SDK) and an LLM provider package (e.g., `@ai-sdk/openai` or `@ai-sdk/google`).
- **X API Client**: Install a package like `twitter-api-v2` to fetch tweets cleanly.
- **Styling**: We already have Tailwind CSS v4. We'll add `lucide-react` for beautiful iconography (e.g., lightbulbs for "bridge hints", search icons).

### 2. Backend (API Routes)

#### [NEW] `app/api/analyze/route.ts`
- This endpoint will receive the `topic` from the frontend.
- **Step 1: Fetch X Data**. Call the Twitter API search endpoint with the `topic` to retrieve the top 20 recent tweets.
- **Step 2: AI Analysis**. Combine the tweets into a text block, prepend the constraints and prompt from `exview.md`, and call the LLM to generate structured JSON using `generateObject` or strict JSON mode from the AI SDK.
- **Step 3: Return JSON**. Respond to the frontend with the `topic_summary` and the `axes` array.

### 3. Frontend (UI Components & Pages)

#### [MODIFY] `app/page.tsx`
- Remove the boilerplate Next.js template.
- Implement a clean, modern "glassmorphism" or dark/light sleek design.
- Create a Hero section with a search input field and a "Generate" button.
- Add Loading states with progressive text (e.g., "Fetching X posts...", "Analyzing with AI...").

#### [NEW] `components/AxisCard.tsx`
- A reusable component to render one of the 3 generated axes.
- **Layout**: 
  - `dimension_name` as the main title.
  - A visual "versus" bar showing `<Label A> vs <Label B>`.
  - A subtle box for the `description`.
  - A highlighted section for the `bridge_hint` (第三極の示唆).
- Allow the card to be "clickable/selectable" so users can pick their preferred axis for the next step of the app journey.

---

## User Review Required

> [!IMPORTANT]
> **API Keys and Providers**
> To automate this, we need to choose which APIs to use and configure your `.env.local` file. 
> 1. **AI Provider**: Which AI do you want to use? (OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet, or Google Gemini 1.5 Pro).
> 2. **X (Twitter) Data**: Do you have a Twitter API Bearer Token available? If not, we can either use a mock API for now to build the UI, or use an alternative web scraping tool.

> [!NOTE]
> **Schema Validation**
> Since the LLM needs to return strict JSON matching your `exview.md` structure, I recommend using the Vercel AI SDK's `generateObject` with `zod` to enforce the output format perfectly. Does this approach sound good?

## Verification Plan

### Automated/Manual Testing
- Run `npm run dev`.
- Ensure we can input a topic, make the API call, and see a loading spinner.
- Verify the AI returns standard JSON corresponding exactly to the `exview.md` requirements.
- Verify that selecting an axis updates local UI state (to prepare for the future "topography map" visualization).
