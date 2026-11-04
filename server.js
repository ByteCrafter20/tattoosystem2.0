import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";
import { spawn, exec } from "child_process";
import connectDB from "./config/Database.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";

import User from "./models/user.js";
import Dashboard from "./models/dashboard.js";
import bcrypt from "bcryptjs";
import requireRole from "./middleware/requireRole.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const bookingSchema = new mongoose.Schema(
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

        reference: { type: String, default: "" },

        username: { type: String, default: "" },
        userId: { type: String, required: true, index: true },

        status: { type: String, default: "Pending" },
        payment: { type: String, default: "Unpaid" },

        inventoryConsumedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

const Booking =
    mongoose.models.Booking ||
    mongoose.model("Booking", bookingSchema, "appointments");

const bookingUploadDir = path.join(__dirname, "public", "uploads");

fs.mkdirSync(bookingUploadDir, { recursive: true });

const bookingUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, bookingUploadDir),
        filename: (req, file, cb) => {
            const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
            cb(null, unique + path.extname(file.originalname).toLowerCase());
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) {
            return cb(null, true);
        }

        cb(new Error("Only image files are allowed."));
    }
});

// Binabawasan ng 1 ang bawat consumable (inks, needles, gloves, etc.)
// kapag natapos ang appointment. Idempotent - hindi doble ang bawas dahil
// sa inventoryConsumedAt flag.
function inventoryModel() {
    if (mongoose.models.Inventory) {
        return mongoose.models.Inventory;
    }

    const inventorySchema = new mongoose.Schema(
        {
            name: { type: String, required: true, trim: true },
            category: { type: String, default: "Other" },
            quantity: { type: Number, default: 0, min: 0 },
            unit: { type: String, default: "pcs" },
            reorderLevel: { type: Number, default: 5, min: 0 },
            consumePerAppointment: { type: Boolean, default: true }
        },
        { timestamps: true }
    );

    return mongoose.model("Inventory", inventorySchema, "inventories");
}

async function consumeInventoryForAppointment(appointment) {
    if (!appointment || appointment.inventoryConsumedAt) {
        return { consumed: 0, skipped: true };
    }

    const Inventory = inventoryModel();

    const result = await Inventory.updateMany(
        { consumePerAppointment: true, quantity: { $gt: 0 } },
        { $inc: { quantity: -1 } }
    );

    appointment.inventoryConsumedAt = new Date();

    await appointment.save();

    const consumed = result.modifiedCount || result.nModified || 0;

    return { consumed, skipped: false };
}

function uploadReference(req, res, next) {
    bookingUpload.single("reference")(req, res, (error) => {
        if (!error) {
            return next();
        }

        return res.status(400).json({
            success: false,
            message: error instanceof multer.MulterError
                ? "Reference image is too large (max 5MB)."
                : error.message
        });
    });
}

const SIZE_PRICES = { Small: 700, Medium: 1500, Large: 10000 };
const CUSTOM_RATE_PER_SQ_INCH = 150;
const CUSTOM_MINIMUM = 700;
const FIXED_SIZE_BY_TYPE = { Minimalist: "Small" };
const VALID_SIZE = ["Small", "Medium", "Large", "Custom"];
const VALID_STATUS = [
    "Pending",
    "Confirmed",
    "Rescheduled",
    "Completed",
    "Cancelled"
];

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

function requireLoginCookie(req, res, next) {
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

const bookingRouter = express.Router();

bookingRouter.get("/", requireLoginCookie, async (req, res) => {
    try {
        const appointments = await Booking
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

bookingRouter.post("/:id/pay", requireLoginCookie, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        const appointment = await Booking.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        if (String(appointment.userId) !== String(req.user.id) &&
            req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Hindi mo puwedeng bayaran ang appointment na ito."
            });
        }

        if (appointment.status === "Cancelled") {
            return res.status(400).json({
                success: false,
                message: "Cancelled appointments cannot be paid."
            });
        }

        const method = (req.body.paymentMethod || "").trim();

        if (method !== "Cash" && method !== "GCash") {
            return res.status(400).json({
                success: false,
                message: "Please choose Cash or GCash."
            });
        }

        const payNow = Number(req.body.amount);

        if (!payNow || isNaN(payNow) || payNow <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid payment amount."
            });
        }

        const total = Number(appointment.amount) > 0
            ? Number(appointment.amount)
            : computeAmount(
                appointment.tattooSize ||
                    FIXED_SIZE_BY_TYPE[appointment.tattooType] ||
                    "",
                appointment.customWidth,
                appointment.customHeight
            );

        if (total <= 0) {
            return res.status(400).json({
                success: false,
                message: "Walang naka-set na amount sa appointment na ito."
            });
        }

        const paidBefore = Number(appointment.paymentAmount) > 0
            ? Number(appointment.paymentAmount)
            : (appointment.payment === "Paid" ? total : 0);

        const remaining = Math.max(total - paidBefore, 0);

        if (remaining <= 0) {
            return res.status(400).json({
                success: false,
                message: "Bayad na ang appointment na ito."
            });
        }

        if (payNow > remaining) {
            return res.status(400).json({
                success: false,
                message: "Payment cannot be more than the remaining balance."
            });
        }

        appointment.amount = total;
        appointment.paymentAmount = paidBefore + payNow;
        appointment.balance = Math.max(total - appointment.paymentAmount, 0);
        appointment.paymentMethod = method;
        appointment.payment = appointment.balance === 0 ? "Paid" : "Partial";

        await appointment.save();

        return res.json({ success: true, appointment });

    } catch (error) {
        console.error("POST /api/appointments/:id/pay", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record payment."
        });
    }
});

bookingRouter.patch("/:id/status", requireLoginCookie, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admins only."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment id."
            });
        }

        const status = (req.body.status || "").trim();

        if (!VALID_STATUS.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment status."
            });
        }

        const appointment = await Booking.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found."
            });
        }

        appointment.status = status;

        await appointment.save();

        let inventory = { consumed: 0, skipped: true };

        if (status === "Completed") {
            inventory = await consumeInventoryForAppointment(appointment);
        }

        return res.json({ success: true, appointment, inventory });

    } catch (error) {
        console.error("PATCH /api/appointments/:id/status", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update appointment status."
        });
    }
});

bookingRouter.post(
    "/",
    requireLoginCookie,
    uploadReference,
    async (req, res) => {
        try {
            const clientName = (req.body.clientName || "").trim();
            const phone = (req.body.phone || "").trim();
            const artist = (req.body.artist || "").trim();
            const time = req.body.time;
            const tattooType = req.body.tattooType;
            const description = (req.body.description || "").trim();

            if (!clientName || !phone || !artist || !req.body.date ||
                !time || !tattooType) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete all required fields."
                });
            }

            const parsedDate = new Date(req.body.date);

            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid appointment date."
                });
            }

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

            if (tattooSize === "Custom" &&
                (customWidth <= 0 || customHeight <= 0)) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter the width and height in inches."
                });
            }

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

            const amount = computeAmount(tattooSize, customWidth, customHeight);

            if (amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Unable to compute the amount for this size."
                });
            }

            const paymentMethod = (req.body.paymentMethod || "").trim();

            if (paymentMethod && paymentMethod !== "Cash" &&
                paymentMethod !== "GCash") {
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
                : (balance === 0 ? "Paid" : "Partial");

            let reference = "";

            if (req.file) {
                reference = "/uploads/" + req.file.filename;
            } else if (typeof req.body.referenceUrl === "string") {
                const chosen = req.body.referenceUrl.trim();

                if (/^\/uploads\//.test(chosen)) {
                    reference = chosen;
                }
            }

            const appointment = await Booking.create({
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
    }
);

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/appointments/admin", reportRoutes);
app.use("/api/appointments", bookingRouter);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/photos", photoRoutes);

const homeFor = (role) => (role === "admin" ? "/dashboard" : "/clientdashboard");

const initializeAdmin = async () => {
    try {
        let admin = await User.findOne({
            username: "admin"
        });

        if (!admin) {
            const hashedPassword = await bcrypt.hash(
                "admin123",
                10
            );

            admin = new User({
                username: "admin",
                password: hashedPassword,
                role: "admin",
                isActive: true
            });

            await admin.save();

            console.log("=================================");
            console.log("✅ ADMIN CREATED");
            console.log("Username: admin");
            console.log("Password: admin123");
            console.log("Role: admin");
            console.log("=================================");

        } else {
            admin.role = "admin";

            if (admin.isActive === undefined) {
                admin.isActive = true;
            }

            await admin.save();

            console.log("=================================");
            console.log("✅ ADMIN ACCOUNT EXISTS");
            console.log("Username:", admin.username);
            console.log("Role:", admin.role);
            console.log("=================================");
        }

    } catch (error) {
        console.error(
            "❌ Admin initialization error:",
            error
        );
    }
};

app.get("/", (req, res) => {
    res.render("login");
});

app.get("/login", (req, res) => {
    const userId = req.cookies.userId;
    const role = req.cookies.role;

    if (userId) {
        return res.redirect(homeFor(role));
    }

    res.render("login");
});

app.get("/register", (req, res) => {
    res.render("register");
});

const MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function percentChange(current, previous) {
    if (!previous) {
        return current ? 100 : 0;
    }

    return Math.round(((current - previous) / previous) * 100);
}

function summarize(bookings) {
    const revenue = bookings.reduce((sum, b) => sum + (b.amount || 0), 0);
    const noShows = bookings.filter((b) => b.status === "Cancelled").length;

    return {
        count: bookings.length,
        revenue,
        average: bookings.length ? Math.round(revenue / bookings.length) : 0,
        noShowRate: bookings.length ? Math.round((noShows / bookings.length) * 100) : 0
    };
}

function buildTrend(bookings, months) {
    const now = new Date();

    return Array.from({ length: months }, (unused, index) => {
        const cursor = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);

        const count = bookings.filter((b) => {
            const date = new Date(b.date);
            return date.getFullYear() === cursor.getFullYear()
                && date.getMonth() === cursor.getMonth();
        }).length;

        return { label: MONTH_LABELS[cursor.getMonth()], count };
    });
}

const EMPTY_DASHBOARD = {
    dashboard: null,
    stats: {},
    recentBookings: [],
    upcomingAppointments: [],
    bookingTrend: []
};

async function buildDashboardData() {
    const dashboard = await Dashboard.findOne();
    const bookings = await Booking.find().lean();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonth = summarize(
        bookings.filter((b) => new Date(b.date) >= monthStart)
    );

    const lastMonth = summarize(
        bookings.filter((b) => {
            const date = new Date(b.date);
            return date >= previousMonthStart && date < monthStart;
        })
    );

    const overall = summarize(bookings);

    const stats = {
        totalBookings: overall.count,
        revenue: overall.revenue,
        avgBookingValue: overall.average,
        noShowRate: overall.noShowRate,
        bookingsDelta: percentChange(thisMonth.count, lastMonth.count),
        revenueDelta: percentChange(thisMonth.revenue, lastMonth.revenue),
        avgDelta: percentChange(thisMonth.average, lastMonth.average),
        noShowDelta: percentChange(thisMonth.noShowRate, lastMonth.noShowRate),
        rangeLabel: now.toLocaleDateString("en-PH", {
            day: "numeric",
            month: "long",
            year: "numeric"
        })
    };

    const recentBookings = [...bookings]
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
        .slice(0, 8);

    const upcomingAppointments = bookings
        .filter((b) => new Date(b.date) >= todayStart && b.status !== "Cancelled")
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 6);

    return {
        dashboard,
        stats,
        recentBookings,
        upcomingAppointments,
        bookingTrend: buildTrend(bookings, 8)
    };
}

app.get("/dashboard", requireRole("admin"), async (req, res) => {
    try {
        res.render("dashboard", await buildDashboardData());
    } catch (error) {
        console.error("Dashboard render error:", error);
        res.render("dashboard", EMPTY_DASHBOARD);
    }
});

app.get("/api/dashboard/summary", requireRole("admin"), async (req, res) => {
    try {
        const data = await buildDashboardData();

        res.json({
            success: true,
            stats: data.stats,
            recentBookings: data.recentBookings,
            upcomingAppointments: data.upcomingAppointments,
            bookingTrend: data.bookingTrend
        });
    } catch (error) {
        console.error("Dashboard summary error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get("/clientdashboard", requireRole("client"), (req, res) => {
    res.render("clientdashboard", {
        username: req.cookies.username || "Client"
    });
});

app.get('/appointment', (req, res) => {
    res.render('appointment');
});

app.get("/inventory", (req, res) => {
    res.render("inventory");
});

app.get("/aboutus", (req, res) => {
    res.render("aboutus");
});

app.get("/photos", (req, res) => {
    res.render("photos", { role: req.cookies.role || "client" });
});

// FxPrint page
app.get(["/fxprint", "/fxprint.ejs"], requireRole("admin"), (req, res) => {
    res.render("fxprint");
});

app.get("/reports", (req, res) => {
    res.render("report&records");
});

app.get("/report&records", (req, res) => {
    res.render("report&records");
});

app.get('/clientappointment', requireRole("admin"), (req, res) => {
    res.render('clientappointment');
});

app.get("/logout", (req, res) => {
    res.clearCookie("userId");
    res.clearCookie("username");
    res.clearCookie("role");

    res.redirect("/login");
});

app.post("/login", async (req, res) => {
    let username = "";
    let password = "";

    if (req.body && req.body.username) {
        username = req.body.username.trim();
    }

    if (req.body && req.body.password) {
        password = req.body.password;
    }

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });
    }

    try {
        const user = await User.findOne({ username: username });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        if (user.isActive === false) {
            return res.status(401).json({
                success: false,
                message: "Your account is inactive."
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 365 * 24 * 60 * 60 * 1000
        };

        res.cookie("userId", user._id.toString(), cookieOptions);
        res.cookie("username", user.username, cookieOptions);
        res.cookie("role", user.role, cookieOptions);

        console.log("=================================");
        console.log("LOGIN SUCCESS");
        console.log("Username:", user.username);
        console.log("Role from DB:", user.role);
        console.log("=================================");

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            role: user.role,
            redirectUrl: homeFor(user.role)
        });

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during login"
        });
    }
});

app.post("/register", async function(req, res) {
    var username = "";
    var password = "";

    if (req.body.username) {
        username = req.body.username.trim();
    }

    if (req.body.password) {
        password = req.body.password;
    }

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Please complete all registration fields."
        });
    }

    if (username.length < 3) {
        return res.status(400).json({
            success: false,
            message: "Username must be at least 3 characters."
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 6 characters."
        });
    }

    try {
        var existingUser = await User.findOne({
            username: username
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });
        }

        var hashedPassword = await bcrypt.hash(
            password,
            10
        );

        var newUser = new User({
            username: username,
            password: hashedPassword,
            role: "client",
            isActive: true
        });

        await newUser.save();

        console.log("=================================");
        console.log("CLIENT REGISTERED");
        console.log("Username:", username);
        console.log("Role: client");
        console.log("=================================");

        var savedUser = await User.findOne({
            username: username
        });

        var passwordMatch = await bcrypt.compare(password, savedUser.password);

        if (passwordMatch) {
            console.log("Password verification: SUCCESS");
            return res.status(201).json({
                success: true,
                message: "Registration successful! Please login.",
                redirectUrl: "/login"
            });
        } else {
            console.log("Password verification: FAILED");
            return res.status(500).json({
                success: false,
                message: "Registration verification failed. Please register again."
            });
        }

    } catch (error) {
        console.error(
            "REGISTRATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    }
});

// GET all appointments for admin
app.get('/api/appointments/admin/all', requireRole('admin'), async (req, res) => {
    try {
        const appointments = await Booking.find({}).sort({ date: -1 }).lean();
        res.json({ success: true, appointments: appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ======================================================
// OPEN IMAGE IN PHOTOSHOP / FXPRINT
// Works because the server and the browser run on the same PC.
// ======================================================

const OPEN_IMAGE_APPS = {
    photoshop: path.normalize(process.env.PHOTOSHOP_PATH || "D:/PhotoshopPortable/Adobe Photoshop CS3.exe"),
    fxprint: path.normalize(process.env.FXPRINT_PATH || "C:/Program Files (x86)/FxPrint/FxPrint.exe")
};

app.post("/api/open-image", requireRole("admin"), (req, res) => {
    const exe = OPEN_IMAGE_APPS[req.body && req.body.app];

    if (!exe) {
        return res.status(400).json({ error: "Unknown application." });
    }

    if (!fs.existsSync(exe)) {
        return res.status(500).json({
            error: "Program not found. Fix its path in server.js: " + exe
        });
    }

    // basename() blocks "../" tricks - only a plain file name is accepted,
    // and only from public/uploads (bookingUploadDir).
    const fileName = path.basename(String((req.body && req.body.image) || ""));

    if (!/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/i.test(fileName)) {
        return res.status(400).json({ error: "Not an image file." });
    }

    const filePath = path.join(bookingUploadDir, fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Image file not found on the server." });
    }

    try {
        // Added cwd to ensure portable apps load their plugins correctly
        const child = spawn(exe, [filePath], { 
            detached: true, 
            stdio: "ignore",
            cwd: path.dirname(exe) 
        });

        child.on("error", (error) => {
            console.error("Spawn failed, trying fallback exec...", error);
            
            // Fallback for stubborn portable apps that refuse to launch via spawn
            exec(`start "" "${exe}" "${filePath}"`, { cwd: path.dirname(exe) });
        });

        child.unref();
        
    } catch (err) {
        console.error("Error launching app:", err);
        // Fallback
        exec(`start "" "${exe}" "${filePath}"`, { cwd: path.dirname(exe) });
    }

    return res.json({ ok: true });
});

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: `API route not found: ${req.method} ${req.originalUrl}`
    });
});

const startServer = async () => {
    try {
        console.log("Connecting to MongoDB...");

        await connectDB();
        await initializeAdmin();

        app.listen(PORT, () => {
            console.log(
                ` Server running at http://localhost:${PORT}`
            );
        });

    } catch (error) {
        console.error(
            "Server error:",
            error
        );
    }
};

startServer();
