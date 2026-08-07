-- CreateEnum
CREATE TYPE "MemberLevel" AS ENUM ('normal', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('amount', 'percent', 'shipping');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'pending_shipment', 'shipped', 'completed', 'cancelled', 'refunding');

-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('standard', 'express');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('pending', 'submitted', 'accepted', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'success', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('points', 'coupon', 'product', 'free_order', 'luck', 'none');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "unionId" TEXT,
    "nickname" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "memberLevel" "MemberLevel" NOT NULL DEFAULT 'normal',
    "points" INTEGER NOT NULL DEFAULT 0,
    "realNameVerified" BOOLEAN NOT NULL DEFAULT false,
    "realNameVerifiedAt" TIMESTAMP(3),
    "realNameEncrypted" TEXT,
    "idCardEncrypted" TEXT,
    "idCardHash" TEXT,
    "lastDrawDate" TIMESTAMP(3),
    "drawCountToday" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "postalCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "subtitle" JSONB NOT NULL DEFAULT '{}',
    "categoryId" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "images" TEXT[],
    "priceCny" INTEGER NOT NULL,
    "originalPriceCny" INTEGER,
    "costCny" INTEGER NOT NULL DEFAULT 0,
    "description" JSONB NOT NULL DEFAULT '{}',
    "ingredients" JSONB NOT NULL DEFAULT '{}',
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "usage" JSONB NOT NULL DEFAULT '{}',
    "nutrition" JSONB NOT NULL DEFAULT '[]',
    "approvalNumber" TEXT,
    "originCountry" TEXT NOT NULL DEFAULT 'JP',
    "isCrossBorder" BOOLEAN NOT NULL DEFAULT true,
    "hsCode" TEXT,
    "customsUnit" TEXT NOT NULL DEFAULT '011',
    "netWeightG" INTEGER NOT NULL DEFAULT 0,
    "grossWeightG" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isOnSale" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsCodeTaxRate" (
    "id" TEXT NOT NULL,
    "hsCode" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "tariffRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.13,
    "exciseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HsCodeTaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "images" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "title" JSONB NOT NULL,
    "value" INTEGER NOT NULL,
    "minAmountCny" INTEGER NOT NULL DEFAULT 0,
    "totalLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "addressId" TEXT NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'standard',
    "trackingNo" TEXT,
    "remark" TEXT,
    "subtotalCny" INTEGER NOT NULL,
    "shippingFeeCny" INTEGER NOT NULL DEFAULT 0,
    "discountCny" INTEGER NOT NULL DEFAULT 0,
    "taxCny" INTEGER NOT NULL DEFAULT 0,
    "totalCny" INTEGER NOT NULL,
    "fxRate" DOUBLE PRECISION NOT NULL,
    "fxQuotedAt" TIMESTAMP(3) NOT NULL,
    "totalJpyEstimate" INTEGER NOT NULL,
    "couponCode" TEXT,
    "declarantIdHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'pending',
    "ebpCode" TEXT NOT NULL,
    "ebcCode" TEXT NOT NULL,
    "customsSerial" TEXT,
    "guid" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "rejectReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameSnapshot" JSONB NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "priceCny" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchNo" TEXT,
    "hsCode" TEXT,
    "appliedTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCny" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prepayId" TEXT,
    "transactionId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amountCny" INTEGER NOT NULL,
    "settledJpy" INTEGER,
    "settledFxRate" DOUBLE PRECISION,
    "rawNotify" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryPrize" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "type" "PrizeType" NOT NULL,
    "payload" TEXT,
    "slot" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryDraw" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotteryDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'CNY',
    "quote" TEXT NOT NULL DEFAULT 'JPY',
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openId_key" ON "User"("openId");

-- CreateIndex
CREATE INDEX "User_unionId_idx" ON "User"("unionId");

-- CreateIndex
CREATE INDEX "User_idCardHash_idx" ON "User"("idCardHash");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Category_parentId_sort_idx" ON "Category"("parentId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_isNew_isActive_idx" ON "Product"("isNew", "isActive");

-- CreateIndex
CREATE INDEX "Product_isOnSale_isActive_idx" ON "Product"("isOnSale", "isActive");

-- CreateIndex
CREATE INDEX "Product_hsCode_idx" ON "Product"("hsCode");

-- CreateIndex
CREATE UNIQUE INDEX "HsCodeTaxRate_hsCode_key" ON "HsCodeTaxRate"("hsCode");

-- CreateIndex
CREATE INDEX "HsCodeTaxRate_hsCode_effectiveFrom_idx" ON "HsCodeTaxRate"("hsCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StockBatch_productId_expiryDate_idx" ON "StockBatch"("productId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_productId_batchNo_key" ON "StockBatch"("productId", "batchNo");

-- CreateIndex
CREATE INDEX "Review_productId_createdAt_idx" ON "Review"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "UserCoupon_userId_used_idx" ON "UserCoupon"("userId", "used");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoupon_userId_couponId_key" ON "UserCoupon"("userId", "couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_userId_status_createdAt_idx" ON "Order"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_declarantIdHash_paidAt_idx" ON "Order"("declarantIdHash", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDeclaration_orderId_key" ON "CustomsDeclaration"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsDeclaration_guid_key" ON "CustomsDeclaration"("guid");

-- CreateIndex
CREATE INDEX "CustomsDeclaration_status_createdAt_idx" ON "CustomsDeclaration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryPrize_slot_key" ON "LotteryPrize"("slot");

-- CreateIndex
CREATE INDEX "LotteryPrize_isActive_idx" ON "LotteryPrize"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryDraw_idempotencyKey_key" ON "LotteryDraw"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LotteryDraw_userId_createdAt_idx" ON "LotteryDraw"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FxRate_base_quote_quotedAt_idx" ON "FxRate"("base", "quote", "quotedAt");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryDraw" ADD CONSTRAINT "LotteryDraw_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryDraw" ADD CONSTRAINT "LotteryDraw_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "LotteryPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
