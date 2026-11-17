// AIで文章などを自動で作る機能の切り替え（2026-11-17 に一旦すべて止めた）。
// 必要になったものから作り直す。ここを true に戻すと、画面のAIボタンがまた出る（Edge Function は残してある）。
export const AI_GENERATION_ENABLED = false;

// HPのニュース作成の「AIで本文を作る」だけは使う（2026-11-17〜）。
// Edge Function generate-cast-content の type "news"。Secret の GEMINI_API_KEY があれば Google、無ければ Claude。
export const HP_NEWS_AI_ENABLED = true;
