export type Company = {
  id: string;
  name: string;
  industry: string;
  region: string;
  employees: number;
  description: string;
  business: string;
  challenge: string;
  proposedService: string;
  address?: string;
  googleMapsUrl?: string;
  website?: string;
  phoneNumber?: string;
  rating?: number;
  reviewCount?: number;
  sourceLinks: CompanySourceLink[];
};

export type CompanySourceLink = {
  type:
    | "companyWebsite"
    | "googleMaps"
    | "prTimes"
    | "wantedly"
    | "recruitPage";
  label: string;
  url: string;
};

export type CompanySearchParams = {
  keyword?: string;
  region?: string;
  industry?: string;
  minEmployees?: number;
};

export type CompanySearchOptions = {
  regions: string[];
  industries: string[];
};

export interface CompanyDataSource {
  searchCompanies(params: CompanySearchParams): Promise<Company[]>;
  getCompanyById(id: string): Promise<Company | null>;
  getSearchOptions(): CompanySearchOptions;
}
