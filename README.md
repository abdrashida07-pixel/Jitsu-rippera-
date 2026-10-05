# Genjutsu Studio — free/open video backend

This version does not use Higgsfield.

It sends one source video + one character reference image to a Hugging Face Gradio Space running Wan 2.2 Animate on ZeroGPU.

## Render environment variables

- `HF_SPACE_ID` — your Hugging Face Space, e.g. `username/genjutsu-motion`
- `HF_TOKEN` — your Hugging Face token, stored only on the Render server

The free Hugging Face ZeroGPU tier has a daily quota. It is not unlimited and the exact availability/queue can vary.

## Local

```bash
npm install
npm start
```
