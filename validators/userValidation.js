import { body } from 'express-validator'

export const changePasswordValidation = [

    body('token')
        .notEmpty()
        .withMessage('Token is required'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters'),

    body('confirm_password')
        .notEmpty()
        .withMessage('Confirm password is required')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password and confirm password do not match')
            }

            return true
        })
]