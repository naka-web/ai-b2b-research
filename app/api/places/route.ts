import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  primaryType?: string;
  primaryTypeDisplayName?: {
    text?: string;
  };
  types?: string[];
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
};

const fieldMask = [
  "nextPageToken",
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
].join(",");

type LocationRestriction = {
  rectangle: {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  };
};

type RegionConfig = {
  label: string;
  queryTerm: string;
  locationRestriction?: LocationRestriction;
};

type CompanyResult = {
  id: string;
  placeId?: string;
  name: string;
  primaryCategory?: string;
  categories: string[];
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  openNow?: boolean;
  openingHours: string[];
};

const regionConfigs: Record<string, RegionConfig> = {
  札幌: {
    label: "札幌市周辺",
    queryTerm: "札幌",
    locationRestriction: {
      rectangle: {
        low: { latitude: 42.75, longitude: 140.95 },
        high: { latitude: 43.25, longitude: 141.75 },
      },
    },
  },
  東京: {
    label: "東京周辺",
    queryTerm: "東京",
    locationRestriction: {
      rectangle: {
        low: { latitude: 35.45, longitude: 139.35 },
        high: { latitude: 35.9, longitude: 139.95 },
      },
    },
  },
  福岡: {
    label: "福岡周辺",
    queryTerm: "福岡",
    locationRestriction: {
      rectangle: {
        low: { latitude: 33.45, longitude: 130.25 },
        high: { latitude: 33.75, longitude: 130.6 },
      },
    },
  },
};

function normalizeDedupValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCompanyDedupKey(company: CompanyResult) {
  if (company.placeId) {
    return `place:${company.placeId}`;
  }

  return `name-address:${normalizeDedupValue(company.name)}:${normalizeDedupValue(
    company.address,
  )}`;
}

function deduplicateCompanies(companies: CompanyResult[]) {
  const seenKeys = new Set<string>();

  return companies.filter((company) => {
    const key = getCompanyDedupKey(company);

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Google Places API キーが未設定です。.env.local に GOOGLE_PLACES_API_KEY を設定してください。",
      },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const referer =
    request.headers.get("referer") ||
    request.headers.get("origin") ||
    request.nextUrl.origin;
  const keyword = searchParams.get("keyword")?.trim() || "企業";
  const region = searchParams.get("region") || "";
  const industry = searchParams.get("industry") || "";
  const pageToken = searchParams.get("pageToken") || "";
  const regionConfig = regionConfigs[region];

  if (!regionConfig) {
    return NextResponse.json(
      { error: "地域を選択してください。" },
      { status: 400 },
    );
  }

  const query = [keyword, industry, regionConfig.queryTerm]
    .filter(Boolean)
    .join(" ");

  const requestBody = {
    textQuery: query,
    languageCode: "ja",
    regionCode: "JP",
    pageSize: 20,
    ...(pageToken ? { pageToken } : {}),
    ...(regionConfig.locationRestriction
      ? { locationRestriction: regionConfig.locationRestriction }
      : {}),
  };

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: referer,
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          payload.error?.message ||
          "Google Places API から企業データを取得できませんでした。",
      },
      { status: response.status },
    );
  }

  const mappedCompanies = ((payload.places || []) as GooglePlace[]).map(
    (place, index) => {
      const openingHours =
        place.regularOpeningHours?.weekdayDescriptions ||
        place.currentOpeningHours?.weekdayDescriptions ||
        [];
      const primaryCategory =
        place.primaryTypeDisplayName?.text || place.primaryType || "";
      const categories = Array.from(
        new Set([primaryCategory, ...(place.types || [])].filter(Boolean)),
      );

      return {
        id: place.id || `${place.displayName?.text || "place"}-${index}`,
        placeId: place.id,
        name: place.displayName?.text || "名称未取得",
        primaryCategory: primaryCategory || undefined,
        categories,
        address: place.formattedAddress || "住所未取得",
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
        website: place.websiteUri,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        googleMapsUri: place.googleMapsUri,
        businessStatus: place.businessStatus,
        openNow:
          place.currentOpeningHours?.openNow ??
          place.regularOpeningHours?.openNow,
        openingHours,
      };
    },
  );
  const companies = deduplicateCompanies(mappedCompanies);

  return NextResponse.json({
    companies,
    query,
    regionScope: regionConfig.label,
    locationMode: regionConfig.locationRestriction ? "restriction" : "none",
    nextPageToken: payload.nextPageToken || null,
    hasNextPage: Boolean(payload.nextPageToken),
  });
}
