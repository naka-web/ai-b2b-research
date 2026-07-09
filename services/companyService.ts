import "server-only";

import { companySearchOptions } from "@/services/companySearchOptions";
import { googleMapsService } from "@/services/googleMapsService";
import {
  Company,
  CompanyDataSource,
  CompanySearchParams,
} from "@/services/companyTypes";

const dummyCompanies: Company[] = [
  {
    id: "sales-bridge",
    name: "株式会社セールスブリッジ",
    industry: "SaaS",
    region: "東京都",
    employees: 180,
    description:
      "営業組織向けに商談管理と顧客分析のクラウドサービスを提供する成長企業です。",
    business:
      "営業活動の進捗管理、商談データ分析、顧客接点の可視化を支援するクラウドサービスを開発・提供しています。",
    challenge:
      "導入企業の業種が広がる一方で、ターゲット別の提案シナリオ作成と営業資料の個別最適化に時間がかかっています。",
    proposedService:
      "業界別の営業トーク生成、商談前リサーチ自動化、CRMデータを活用した提案書作成支援を提案できます。",
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: "https://example.com/sales-bridge",
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: "https://maps.google.com/?q=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE%E3%82%BB%E3%83%BC%E3%83%AB%E3%82%B9%E3%83%96%E3%83%AA%E3%83%83%E3%82%B8",
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: "https://prtimes.jp/main/html/searchrlp/company_id/000000000",
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: "https://www.wantedly.com/companies/example-sales-bridge",
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: "https://example.com/sales-bridge/recruit",
      },
    ],
  },
  {
    id: "tokai-smart-factory",
    name: "東海スマートファクトリー株式会社",
    industry: "製造業",
    region: "愛知県",
    employees: 420,
    description:
      "製造ラインの可視化と設備保全のデジタル化に取り組む部品メーカーです。",
    business:
      "自動車・産業機械向け部品の製造に加え、工場内データを活用した生産管理の高度化を進めています。",
    challenge:
      "設備データや作業記録が部署ごとに分散しており、異常検知や改善活動のナレッジ共有が十分に進んでいません。",
    proposedService:
      "製造データの統合ダッシュボード、保全記録のAI要約、改善提案の自動レポート化を提案できます。",
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: "https://example.com/tokai-smart-factory",
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: "https://maps.google.com/?q=%E6%9D%B1%E6%B5%B7%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%83%95%E3%82%A1%E3%82%AF%E3%83%88%E3%83%AA%E3%83%BC%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE",
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: "https://prtimes.jp/main/html/searchrlp/company_id/000000001",
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: "https://www.wantedly.com/companies/example-tokai-smart-factory",
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: "https://example.com/tokai-smart-factory/recruit",
      },
    ],
  },
  {
    id: "jinzai-accel",
    name: "人材アクセル株式会社",
    industry: "人材",
    region: "大阪府",
    employees: 95,
    description:
      "中堅企業向けに採用代行と定着支援サービスを展開しています。",
    business:
      "採用戦略の設計、候補者集客、面接調整、入社後フォローまでを一気通貫で支援しています。",
    challenge:
      "顧客ごとの採用要件整理と候補者向けメッセージ作成に工数がかかり、担当者の属人化が課題です。",
    proposedService:
      "求人票の自動作成、候補者スクリーニング支援、顧客別の採用レポート自動生成を提案できます。",
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: "https://example.com/jinzai-accel",
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: "https://maps.google.com/?q=%E4%BA%BA%E6%9D%90%E3%82%A2%E3%82%AF%E3%82%BB%E3%83%AB%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE",
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: "https://prtimes.jp/main/html/searchrlp/company_id/000000002",
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: "https://www.wantedly.com/companies/example-jinzai-accel",
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: "https://example.com/jinzai-accel/recruit",
      },
    ],
  },
  {
    id: "kyushu-logi-cloud",
    name: "九州ロジクラウド株式会社",
    industry: "物流",
    region: "福岡県",
    employees: 260,
    description:
      "物流拠点の配送計画と在庫管理を支援するクラウド基盤を運営しています。",
    business:
      "配送ルート最適化、倉庫在庫の可視化、荷主企業向けの物流管理クラウドを提供しています。",
    challenge:
      "荷主からの問い合わせ対応や配送遅延時の状況説明が手作業に寄っており、対応品質にばらつきがあります。",
    proposedService:
      "問い合わせ回答支援、配送状況の自動要約、荷主向けレポート生成のAI化を提案できます。",
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: "https://example.com/kyushu-logi-cloud",
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: "https://maps.google.com/?q=%E4%B9%9D%E5%B7%9E%E3%83%AD%E3%82%B8%E3%82%AF%E3%83%A9%E3%82%A6%E3%83%89%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE",
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: "https://prtimes.jp/main/html/searchrlp/company_id/000000003",
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: "https://www.wantedly.com/companies/example-kyushu-logi-cloud",
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: "https://example.com/kyushu-logi-cloud/recruit",
      },
    ],
  },
  {
    id: "north-health-data",
    name: "北日本ヘルスデータ株式会社",
    industry: "ヘルスケア",
    region: "北海道",
    employees: 130,
    description:
      "医療機関向けに患者データ管理と業務効率化ツールを提供しています。",
    business:
      "医療機関の予約、問診、患者情報管理を支援する業務システムを開発・運用しています。",
    challenge:
      "医療現場の業務記録が多く、導入支援時のヒアリング整理や運用改善提案に時間がかかっています。",
    proposedService:
      "ヒアリングメモの要約、業務フロー分析、医療機関別の改善提案テンプレート作成を提案できます。",
    sourceLinks: [
      {
        type: "companyWebsite",
        label: "会社HP",
        url: "https://example.com/north-health-data",
      },
      {
        type: "googleMaps",
        label: "Google Maps",
        url: "https://maps.google.com/?q=%E5%8C%97%E6%97%A5%E6%9C%AC%E3%83%98%E3%83%AB%E3%82%B9%E3%83%87%E3%83%BC%E3%82%BF%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE",
      },
      {
        type: "prTimes",
        label: "PR TIMES",
        url: "https://prtimes.jp/main/html/searchrlp/company_id/000000004",
      },
      {
        type: "wantedly",
        label: "Wantedly",
        url: "https://www.wantedly.com/companies/example-north-health-data",
      },
      {
        type: "recruitPage",
        label: "採用ページ",
        url: "https://example.com/north-health-data/recruit",
      },
    ],
  },
];

function matchesKeyword(company: Company, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return [
    company.name,
    company.industry,
    company.region,
    company.description,
    company.business,
    company.challenge,
    company.proposedService,
  ].some((value) => value.toLowerCase().includes(normalizedKeyword));
}

const dummyCompanyDataSource: CompanyDataSource = {
  async searchCompanies(params) {
    return dummyCompanies.filter((company) => {
      const matchesRegion =
        !params.region ||
        params.region === "全国" ||
        company.region === params.region;
      const matchesIndustry =
        !params.industry || company.industry === params.industry;
      const matchesEmployees =
        !params.minEmployees || company.employees >= params.minEmployees;

      return (
        matchesKeyword(company, params.keyword ?? "") &&
        matchesRegion &&
        matchesIndustry &&
        matchesEmployees
      );
    });
  },

  async getCompanyById(id) {
    return dummyCompanies.find((company) => company.id === id) ?? null;
  },

  getSearchOptions() {
    return companySearchOptions;
  },
};

export const companyService: CompanyDataSource = {
  async searchCompanies(params: CompanySearchParams) {
    if (googleMapsService.isConfigured()) {
      try {
        return await googleMapsService.searchCompanies(params);
      } catch {
        return dummyCompanyDataSource.searchCompanies(params);
      }
    }

    return dummyCompanyDataSource.searchCompanies(params);
  },

  async getCompanyById(id) {
    return dummyCompanyDataSource.getCompanyById(id);
  },

  getSearchOptions() {
    return companySearchOptions;
  },
};
