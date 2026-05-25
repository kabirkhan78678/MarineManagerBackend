export const WEIGHT_CATEGORIES = [
  "UP_TO_500_KG",
  "UP_TO_1_TON",
  "UP_TO_2_TONS",
  "UP_TO_5_TONS",
  "UP_TO_10_TONS",
  "OVER_10_TONS",
];

export const LENGTH_CATEGORIES = [
  "UP_TO_5_FT",
  "5_TO_10_FT",
  "10_TO_20_FT",
  "20_TO_30_FT",
  "30_TO_40_FT",
  "40_PLUS_FT",
];

export const WEIGHT_CATEGORY_ERROR_MESSAGE =
  `Weight category must be one of: ${WEIGHT_CATEGORIES.join(", ")}`;

export const LENGTH_CATEGORY_ERROR_MESSAGE =
  `Length category must be one of: ${LENGTH_CATEGORIES.join(", ")}`;

export const API_TO_PRISMA_LENGTH_CATEGORY = {
  UP_TO_5_FT: "UP_TO_5_FT",
  "5_TO_10_FT": "FIVE_TO_TEN_FT",
  "10_TO_20_FT": "TEN_TO_TWENTY_FT",
  "20_TO_30_FT": "TWENTY_TO_THIRTY_FT",
  "30_TO_40_FT": "THIRTY_TO_FORTY_FT",
  "40_PLUS_FT": "FORTY_PLUS_FT",
};

export const PRISMA_TO_API_LENGTH_CATEGORY = Object.fromEntries(
  Object.entries(API_TO_PRISMA_LENGTH_CATEGORY).map(([apiValue, prismaValue]) => [
    prismaValue,
    apiValue,
  ])
);

export function toPrismaLengthCategory(value) {
  if (value == null || value === "") return null;
  return API_TO_PRISMA_LENGTH_CATEGORY[value] || value;
}

export function toApiLengthCategory(value) {
  if (value == null || value === "") return null;
  return PRISMA_TO_API_LENGTH_CATEGORY[value] || value;
}
