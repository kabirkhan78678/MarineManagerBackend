export const handleSuccess = (
    res,
    statusCode,
    message,
    data = []
) => {

    return res.status(statusCode).json({
        success: true,
        message,
        data
    })
}

export const handleError = (
    res,
    statusCode,
    message
) => {

    return res.status(statusCode).json({
        success: false,
        message
    })
}