import { PrismaClient } from "@prisma/client";
import querystring from "querystring";
import { xero } from "../utils/xeroClient.js";
import { XeroClient } from "xero-node";
import { createErrorResponse, createSuccessResponse } from "../utils/responseUtil.js";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();
await xero.initialize();


export async function connectToXero(req, res) {
  try {
    const userId = req.user.id;
    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: "openid profile email accounting.transactions accounting.contacts accounting.settings offline_access".split(" "),
      state: userId.toString()
    });
    const consentUrl = await xero.buildConsentUrl();
    return createSuccessResponse(res, 200, true, "new", consentUrl);
  } catch (error) {
    console.error("Error generating Xero consent URL:", error);
    return createErrorResponse(res, 500, "Failed to generate Xero connection link");
  }
}

export async function handleXeroCallback(req, res) {
  try {
    console.log("CALLBACK URL:", req.originalUrl);
    console.log("CALLBACK QUERY:", req.query);

    const state = req.query.state;
    if (!state) {
      return createErrorResponse(res, 400, "Invalid or expired OAuth state");
    }

    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: "openid profile email accounting.transactions accounting.contacts accounting.settings offline_access".split(" "),
      state: state.toString()
    });

    // Complete the OAuth flow using the full callback URL
    const tokenSet = await xero.apiCallback(req.originalUrl);
    await xero.updateTenants(); // fetch organization info

    // Extract needed info
    const xeroUserId = tokenSet.claims.sub;
    const accessToken = tokenSet.access_token;
    const refreshToken = tokenSet.refresh_token;
    const expiresAt = new Date(tokenSet.expires_at * 1000);
    const tenantId = xero.tenants[0].tenantId;

    console.log({ xeroUserId, accessToken, refreshToken, expiresAt, tenantId, state });

    await prisma.user.update({
      where: {
        id: parseInt(state)
      },
      data: {
        xero_access_token: accessToken,
        xero_refresh_token: refreshToken,
        xero_expiresAt: expiresAt,
        xero_tenantId: tenantId,
        xero_connected: 1

      }
    })

    // Store the tokens in your database
    // await prisma.user.update({ ... });

    //return res.send("✅ Xero account connected successfully");
    return res.redirect(`https://fmservicehub.com/connected-to-xero`);
  } catch (error) {
    console.error("Xero callback error:", error);
    return res.redirect(`https://fmservicehub.com/failed-to-connect-xero`);
  }
}

