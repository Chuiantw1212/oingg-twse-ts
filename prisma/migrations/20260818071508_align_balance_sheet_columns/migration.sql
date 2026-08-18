/*
  Warnings:

  - You are about to drop the column `bookValuePerShare` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `capitalStock` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `capitalSurplus` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `commonControlPredecessorEquity` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `currentAssets` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `currentLiabilities` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `equityToParent` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `equityVirtualCurrency` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `equivalentSharesFromPrepayments` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `nonCommonControlPredecessorEquity` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `nonControllingInterest` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `nonCurrentAssets` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `nonCurrentLiabilities` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `otherEquity` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `reportDate` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `retainedEarnings` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `sharesAwaitingCancellation` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `totalAssets` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `totalEquity` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `totalLiabilities` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `treasurySharesHeldBySubs` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - You are about to drop the column `treasuryStock` on the `quarterly_balance_sheet` table. All the data in the column will be lost.
  - Added the required column `report_date` to the `quarterly_balance_sheet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "quarterly_balance_sheet" DROP COLUMN "bookValuePerShare",
DROP COLUMN "capitalStock",
DROP COLUMN "capitalSurplus",
DROP COLUMN "commonControlPredecessorEquity",
DROP COLUMN "currentAssets",
DROP COLUMN "currentLiabilities",
DROP COLUMN "equityToParent",
DROP COLUMN "equityVirtualCurrency",
DROP COLUMN "equivalentSharesFromPrepayments",
DROP COLUMN "nonCommonControlPredecessorEquity",
DROP COLUMN "nonControllingInterest",
DROP COLUMN "nonCurrentAssets",
DROP COLUMN "nonCurrentLiabilities",
DROP COLUMN "otherEquity",
DROP COLUMN "reportDate",
DROP COLUMN "retainedEarnings",
DROP COLUMN "sharesAwaitingCancellation",
DROP COLUMN "totalAssets",
DROP COLUMN "totalEquity",
DROP COLUMN "totalLiabilities",
DROP COLUMN "treasurySharesHeldBySubs",
DROP COLUMN "treasuryStock",
ADD COLUMN     "book_value_per_share" DECIMAL(10,2),
ADD COLUMN     "capital_stock" BIGINT,
ADD COLUMN     "capital_surplus" BIGINT,
ADD COLUMN     "common_control_predecessor_equity" BIGINT,
ADD COLUMN     "current_assets" BIGINT,
ADD COLUMN     "current_liabilities" BIGINT,
ADD COLUMN     "equity_to_parent" BIGINT,
ADD COLUMN     "equity_virtual_currency" BIGINT,
ADD COLUMN     "equivalent_shares_from_prepayments" BIGINT,
ADD COLUMN     "non_common_control_predecessor_equity" BIGINT,
ADD COLUMN     "non_controlling_interest" BIGINT,
ADD COLUMN     "non_current_assets" BIGINT,
ADD COLUMN     "non_current_liabilities" BIGINT,
ADD COLUMN     "other_equity" BIGINT,
ADD COLUMN     "report_date" DATE NOT NULL,
ADD COLUMN     "retained_earnings" BIGINT,
ADD COLUMN     "shares_awaiting_cancellation" BIGINT,
ADD COLUMN     "total_assets" BIGINT,
ADD COLUMN     "total_equity" BIGINT,
ADD COLUMN     "total_liabilities" BIGINT,
ADD COLUMN     "treasury_shares_held_by_subs" BIGINT,
ADD COLUMN     "treasury_stock" BIGINT;
