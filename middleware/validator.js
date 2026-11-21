import expressValidator from "express-validator";

const { body, validationResult } = expressValidator;

// Ibinabalik ang unang error sa parehong JSON format na ginagamit ng buong app.
export function handleValidation(req, res, next) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return next();
    }

    return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
    });
}

export const loginValidation = [
    body("username")
        .isString().withMessage("Username and password are required")
        .trim()
        .notEmpty().withMessage("Username and password are required")
        .isLength({ max: 50 }).withMessage("Invalid username or password"),
    body("password")
        .isString().withMessage("Username and password are required")
        .notEmpty().withMessage("Username and password are required")
        .isLength({ max: 128 }).withMessage("Invalid username or password"),
    handleValidation
];

export const registerValidation = [
    body("username")
        .isString().withMessage("Please complete all registration fields.")
        .trim()
        .notEmpty().withMessage("Please complete all registration fields.")
        .isLength({ min: 3 }).withMessage("Username must be at least 3 characters.")
        .isLength({ max: 30 }).withMessage("Username must be at most 30 characters.")
        .matches(/^[A-Za-z0-9._-]+$/).withMessage("Username can only use letters, numbers, dot, dash and underscore."),
    body("password")
        .isString().withMessage("Please complete all registration fields.")
        .notEmpty().withMessage("Please complete all registration fields.")
        .isLength({ min: 6 }).withMessage("Password must be at least 6 characters.")
        .isLength({ max: 128 }).withMessage("Password must be at most 128 characters."),
    handleValidation
];