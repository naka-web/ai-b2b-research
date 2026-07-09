import "server-only";

import { Company, CompanySearchParams } from "@/services/companyTypes";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: {
    text?: string;
  };
};

type GooglePlacesSearchTextResponse = {
  places?: GooglePlace[];
};

const placesFieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
].join(",");

function buildTextQuery(params: CompanySearchParams) {
  return [
    params.keyword?.trim() || "企業",
    params.industry?.trim(),
    params.region && params.region !== "全国" ? params.region : "日本",
  ]
    .filter(Boolean)
    .join(" ");
}

function mapPlaceToCompany(place: GooglePlace, index: number): Company {
  const name = place.displayName?.text || "名称未取得の企業";
  const industry = place.primaryTypeDisplayName?.text || "未分類";
  const googleMapsUrl =
    place.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      name,
    )}`;
  const website = place.websiteUri || "";

  return {
    id: place.id || `google-place-${index}`,
    name,
    industry,
    region: place.formattedAddress || "住所未取得",
    employees: 0,
    description:
      "Google Places APIから取得した実在企業候補です。従業員数や営業課題は別データソース連携時に補完します。",
    business:
      "Google Places APIから取得した企業情報です。詳細な事業内容は会社HPや追加データソースで確認してください。",
    challenge:
      "現時点では外部公開情報のみのため、具体的な課題はAI要約や追加調査で補完します。",
    proposedService:
      "業種、所在地、Webサイト情報をもとに、営業仮説を作成して提案内容を検討します。",
    address: place.formattedAddress,
    googleMapsUrl,
    website,
    phoneNumber: place.nationalPhoneNumber,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: website || googleMapsUrl,
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: googleMapsUrl,
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: `https://prtimes.jp/main/html/searchrlp/company/${encodeURIComponent(
          name,
        )}`,
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: `https://www.wantedly.com/search?q=${encodeURIComponent(name)}`,
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: website || googleMapsUrl,
      },
    ],
  };
}

export const googleMapsService = {
  isConfigured() {
    return Boolean(process.env.GOOGLE_MAPS_API_KEY);
  },

  async searchCompanies(params: CompanySearchParams): Promise<Company[]> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
    }

    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": placesFieldMask,
        },
        body: JSON.stringify({
          textQuery: buildTextQuery(params),
          languageCode: "ja",
          regionCode: "JP",
          pageSize: 10,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Google Places API request failed.");
    }

    const data = (await response.json()) as GooglePlacesSearchTextResponse;

    return (data.places ?? []).map(mapPlaceToCompany);
  },
};
