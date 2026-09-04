export const FDA_TEA_SEARCH_TERMS = [
  "matcha",
  "green tea",
  "tea powder",
  "powdered tea",
  "Japanese tea",
  "green tea powder",
] as const;

export type FdaTeaSearchTerm = (typeof FDA_TEA_SEARCH_TERMS)[number];

export const FDA_TEA_PRODUCT_CODE_RULES = [
  {
    pattern: /^31[KL]/i,
    description: "Industry 31 (Coffee/Tea) の Class K（茶）または Class L（カフェイン除去茶）",
  },
] as const;
