import { MessageEnum } from "../config/message.js";

// ==========================================
// FORMAT MESSAGE
// ==========================================
function formatMessage(messageEnum, data = {}, locale = "en") {

  let message = "Error";

  // If direct string passed
  if (typeof messageEnum === "string") {
    message = messageEnum;
  }

  // If object enum passed
  else if (typeof messageEnum === "object" && messageEnum !== null) {
    message =
      messageEnum?.[locale] ||
      messageEnum?.["en"] ||
      "Error";
  }

  // Replace placeholders
  return Object.keys(data).reduce((formattedMessage, key) => {

    const placeholder = `{${key}}`;

    return formattedMessage.replaceAll(
      placeholder,
      data[key]
    );

  }, message);
}

// ==========================================
// SUCCESS RESPONSE
// ==========================================
function createSuccessResponse(
  res,
  statusCode = 200,
  success = true,
  messageEnum = "Success",
  data = {},
  locale = "en"
) {

  const message = formatMessage(
    messageEnum,
    data,
    locale
  );

  return res.status(statusCode).json({
    success,
    message,
    status: statusCode,
    data
  });
}

// ==========================================
// ERROR RESPONSE
// ==========================================
function createErrorResponse(
  res,
  statusCode = 500,
  messageEnum = "Error",
  data = {},
  locale = "en"
) {

  const message = formatMessage(
    messageEnum,
    data,
    locale
  );

  return res.status(statusCode).json({
    success: false,
    message,
    status: statusCode,
    data
  });
}

export {
  createSuccessResponse,
  createErrorResponse,
  formatMessage
};