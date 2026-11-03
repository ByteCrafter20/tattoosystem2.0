// routes/appointmentRoutes.js
//
// Mounted sa server.js:
//     app.use("/api/appointments", appointmentRoutes);
//
// Kailangan: npm install multer

import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";

// ======================================================
// MODEL - standalone, walang import sa models/
// Naka-turo sa collection na "appointments".
// ======================================================

const appointmentSchema = new mongoose.Schema(
    {
        clientName: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        artist: { type: String, required: true, trim: true },
        date: { type: Date, required: true },
        time: { type: String, required: true },
        tattooType: { type: String, required: true },
        description: { type: String, default: "" },

        tattooSize: { type: String, default: "" },
        customWidth: { type: Number, default: null },
        customHeight: { type: Number, default: null },

        placement: { type: String, default: "" },
        placementOther: { type: String, default: "" },
        placementSide: { type: String, default: "" },

        amount: { type: Number, default: 0, min: 0 },
        paymentMethod: { type: String, default: "" },
        paymentAmount: { type: Number, default: 0, min: 0 },
        balance: { type: Number, default: 0, min: 0 },

        // Path ng reference photo, hal. "/uploads/1699999999-123.jpg"
        reference: { type: String, default: "" },

        username: { type: String, default: "" },
        userId: { type: String, required: true, index: true },

        status: {
            type: String,
            enum: ["Pending", "Confirmed", "Rescheduled", "Completed", "Cancelled"],
            default: "Pending"
        },

        payment: {
            type: String,
            enum: ["Unpaid", "Cash", "GCash", "Paid"],
            default: "Unpaid"
        }
    },
    { timestamps: true }
);

const Appointment =
    mongoose.models.Appointment ||
    mongoose.model("Appointment", appointmentSchema, "appointments");

// ======================================================
// UPLOAD
// ======================================================

const uploadDir = path.join(process.cwd(), "public", "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
            cb(null, unique + path.extname(file.originalname).toLowerCase());
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        cb(null, /^image\//.test(file.mimetype));
    }
});

// ======================================================
// AUTH
// ======================================================

function requireLogin(req, res, next) {
    if (!req.cookies || !req.cookies.userId) {
        return res.status(401).json({
            success: false,
            message: "Not logged in."
        });
    }

    req.user = {
        id: req.cookies.userId,
        username: req.cookies.username || "",
        role: req.cookies.role || "client"
    };

    next();
}

function requireAdmin(req, res, next) {
    requireLogin(req, res, function () {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admins only."
            });
        }

        next();
    });
}

// ======================================================
// HELPERS
// ======================================================

const VALID_STATUS = [
    "Pending",
    "Confirmed",
    "Rescheduled",
    "Completed",
    "Cancelled"
];

const VALID_PAYMENT = ["Unpaid", "Cash", "GCash", "Paid"];

const VALID_PAYMENT_METHOD = ["Cash", "GCash"];

const VALID_SIZE = ["Small", "Medium", "Large", "Custom"];

// Dapat katulad ng nasa public/js/clientdashboard.js
const SIZE_PRICES = { Small: 700, Medium: 1500, Large: 10000 };
const CUSTOM_RATE_PER_SQ_INCH = 150;
const CUSTOM_MINIMUM = 700;
const FIXED_SIZE_BY_TYPE = { Minimalist: "Small" };

function computeAmount(size, width, height) {
    if (Object.prototype.hasOwnProperty.call(SIZE_PRICES, size)) {
        return SIZE_PRICES[size];
    }

    if (size === "Custom") {
        const w = Number(width);
        const h = Number(height);

        if (!w || !h || w <= 0 || h <= 0) {
            return 0;
        }

        return Math.max(w * h * CUSTOM_RATE_PER_SQ_INCH, CUSTOM_MINIMUM);
    }

    return 0;
}

function isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

const router = express.Router();

// ======================================================
// ADMIN - dapat nauuna kaysa sa /:id
// ======================================================

router.get("/admin/all", requireAdmin, async (req, res) => {
    try {
        const appointments = await Appointment
            .find({})
            .sort({ date: -1, time: -1 })
            .lean();

        return res.json({ success: true, appointments });

    } catch (error) {
        console.error("GET /api/appointments/admin/all", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load appointments."
        });
    }
});

router.get("/admin/reports", requireAdmin, async (req, res) => {
    try {
        const appointments = await Appointment
            .find({})
            .sort({ date: -1, time: -1 })
            .lean();

        const clientMap = new Map();

        appointments.forEach(function (appointment) {
            const key = appointment.userId || appointment.clientName;

            if (!clientMap.has(key)) {
                clientMap.set(key, {
                    name: appointment.clientName,
                    username: appointment.username || "",
                    phone: appointment.phone || "",
                    count: 0
                });
            }

            clientMap.get(key).count += 1;
        });

        const clients = Array
            .from(clientMap.values())
            .sort(function (a, b) { return b.count - a.count; });

        const countBy = function (status) {
            return appointments.filter(function (a) {
                return a.status === status;
            }).length;
        };

        return res.json({
            success: true,
            summary: {
                totalAppointments: appointments.length,
                totalClients: clients.length,
                pending: countBy("Pending"),
                confirmed: countBy("Confirmed"),
                completed: countBy("Completed"),
                cancelled: countBy("Cancelled")
            },
            appointments,
            clients
        });

    } catch (error) {
        console.error("GET /api/appointments/admin/reports", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load reports."
        });
    }
});

router.put("/admin/:id/status", requireAdmin, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        if (!VALID_STATUS.includes(req.body.status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status."
            });
        }

        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        );

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("PUT /api/appointments/admin/:id/status", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update status."
        });
    }
});

router.put("/admin/:id/payment", requireAdmin, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        if (!VALID_PAYMENT.includes(req.body.payment)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment type."
            });
        }

        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        appointment.payment = req.body.payment;

        if (req.body.payment === "Paid") {
            appointment.paymentAmount = appointment.amount;
            appointment.balance = 0;
        } else if (req.body.payment === "Unpaid") {
            appointment.paymentAmount = 0;
            appointment.balance = appointment.amount;
        } else {
            appointment.paymentMethod = req.body.payment;

            if (req.body.paymentAmount !== undefined) {
                const paid = Math.max(Number(req.body.paymentAmount) || 0, 0);

                appointment.paymentAmount = Math.min(paid, appointment.amount);
            }

            appointment.balance = Math.max(
                appointment.amount - appointment.paymentAmount,
                0
            );
        }

        await appointment.save();

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("PUT /api/appointments/admin/:id/payment", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update payment."
        });
    }
});

router.put("/admin/:id/reschedule", requireAdmin, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        const parsedDate = new Date(req.body.date);

        if (!req.body.date || isNaN(parsedDate.getTime()) || !req.body.time) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid new date and time."
            });
        }

        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            {
                date: parsedDate,
                time: req.body.time,
                status: "Rescheduled"
            },
            { new: true }
        );

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("PUT /api/appointments/admin/:id/reschedule", error);
        return res.status(500).json({
            success: false,
            message: "Failed to reschedule appointment."
        });
    }
});

// ======================================================
// BAGO - palitan ang reference photo ng isang appointment
// (galing sa pag-click ng picture sa Reference Photo modal)
// ======================================================

router.put("/admin/:id/reference", requireAdmin, upload.single("reference"), async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please choose an image file."
            });
        }

        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id,
            { reference: "/uploads/" + req.file.filename },
            { new: true }
        );

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("PUT /api/appointments/admin/:id/reference", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update photo."
        });
    }
});

// Para ma-ayos ng admin ang Size, Placement, at Amount ng lumang booking.
router.put("/admin/:id/details", requireAdmin, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        if (typeof req.body.tattooSize === "string") {
            if (!VALID_SIZE.includes(req.body.tattooSize)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid tattoo size."
                });
            }

            appointment.tattooSize = req.body.tattooSize;
        }

        if (req.body.customWidth !== undefined) {
            appointment.customWidth = Number(req.body.customWidth) || null;
        }

        if (req.body.customHeight !== undefined) {
            appointment.customHeight = Number(req.body.customHeight) || null;
        }

        if (typeof req.body.placement === "string") {
            appointment.placement = req.body.placement.trim();
        }

        if (typeof req.body.placementOther === "string") {
            appointment.placementOther = req.body.placementOther.trim();
        }

        if (typeof req.body.placementSide === "string") {
            appointment.placementSide = req.body.placementSide.trim();
        }

        if (req.body.amount !== undefined) {
            const amount = Number(req.body.amount);

            if (isNaN(amount) || amount < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid amount."
                });
            }

            appointment.amount = amount;
        } else {
            appointment.amount = computeAmount(
                appointment.tattooSize,
                appointment.customWidth,
                appointment.customHeight
            );
        }

        appointment.paymentAmount = Math.min(
            appointment.paymentAmount || 0,
            appointment.amount
        );

        appointment.balance = Math.max(
            appointment.amount - appointment.paymentAmount,
            0
        );

        await appointment.save();

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("PUT /api/appointments/admin/:id/details", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update appointment details."
        });
    }
});

// ======================================================
// CLIENT
// ======================================================

router.get("/", requireLogin, async (req, res) => {
    try {
        const appointments = await Appointment
            .find({ userId: req.user.id })
            .sort({ date: 1, time: 1 })
            .lean();

        return res.json({ success: true, appointments });

    } catch (error) {
        console.error("GET /api/appointments", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load appointments."
        });
    }
});

router.post("/", requireLogin, upload.single("reference"), async (req, res) => {
    try {
        const clientName = (req.body.clientName || "").trim();
        const phone = (req.body.phone || "").trim();
        const artist = (req.body.artist || "").trim();
        const date = req.body.date;
        const time = req.body.time;
        const tattooType = req.body.tattooType;
        const description = (req.body.description || "").trim();

        if (!clientName || !phone || !artist || !date || !time || !tattooType) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields."
            });
        }

        const parsedDate = new Date(date);

        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment date."
            });
        }

        // SIZE - Minimalist ay laging Small, kaya kahit disabled ang select
        // sa form, tama pa rin ang naitatala.
        const tattooSize = FIXED_SIZE_BY_TYPE[tattooType] ||
            (req.body.tattooSize || req.body.size || "").trim();

        if (!VALID_SIZE.includes(tattooSize)) {
            return res.status(400).json({
                success: false,
                message: "Please choose a tattoo size."
            });
        }

        const customWidth = tattooSize === "Custom"
            ? Number(req.body.customWidth) || 0
            : null;

        const customHeight = tattooSize === "Custom"
            ? Number(req.body.customHeight) || 0
            : null;

        if (tattooSize === "Custom" && (customWidth <= 0 || customHeight <= 0)) {
            return res.status(400).json({
                success: false,
                message: "Please enter the width and height in inches."
            });
        }

        // PLACEMENT
        const placement = (req.body.placement || "").trim();
        const placementOther = (req.body.placementOther || "").trim();
        const placementSide = (req.body.placementSide || "").trim();

        if (!placement) {
            return res.status(400).json({
                success: false,
                message: "Please choose a tattoo placement."
            });
        }

        if (placement === "Other" && !placementOther) {
            return res.status(400).json({
                success: false,
                message: "Please describe the tattoo placement."
            });
        }

        // AMOUNT - kinukuwenta sa server para hindi mapeke ang presyo.
        const amount = computeAmount(tattooSize, customWidth, customHeight);

        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Unable to compute the amount for this tattoo size."
            });
        }

        // PAYMENT
        const paymentMethod = (req.body.paymentMethod || "").trim();


        if (paymentMethod && !VALID_PAYMENT_METHOD.includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment method."
            });
        }

        const paidInput = Math.max(Number(req.body.paymentAmount) || 0, 0);

        if (paidInput > amount) {
            return res.status(400).json({
                success: false,
                message: "Payment cannot be more than the total amount."
            });
        }

        const paymentAmount = paymentMethod ? paidInput : 0;
        const balance = Math.max(amount - paymentAmount, 0);

        const payment = paymentAmount <= 0
            ? "Unpaid"
            : (balance === 0 ? "Paid" : paymentMethod);

        // Reference photo: sariling upload ng client, o ang napiling
        // design galing sa Photos Gallery (referenceUrl).
        let reference = "";

        if (req.file) {
            reference = "/uploads/" + req.file.filename;
        } else if (typeof req.body.referenceUrl === "string") {
            const chosen = req.body.referenceUrl.trim();

            if (/^\/uploads\//.test(chosen)) {
                reference = chosen;
            }
        }

        const appointment = await Appointment.create({
            clientName,
            phone,
            artist,
            date: parsedDate,
            time,
            tattooType,
            description,
            tattooSize,
            customWidth,
            customHeight,
            placement,
            placementOther,
            placementSide,
            amount,
            paymentMethod,
            paymentAmount,
            balance,
            payment,
            reference,
            username: req.user.username,
            userId: req.user.id,
            status: "Pending"
        });

        return res.status(201).json({ success: true, appointment });

    } catch (error) {
        console.error("POST /api/appointments", error);
        return res.status(500).json({
            success: false,
            message: "Failed to book appointment."
        });
    }
});

router.delete("/:id", requireLogin, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        const appointment = await Appointment.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { status: "Cancelled" },
            { new: true }
        );

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("DELETE /api/appointments/:id", error);
        return res.status(500).json({
            success: false,
            message: "Failed to cancel appointment."
        });
    }
});

export default router;