import Appointment from "./models/appointment.js"; // palitan kung iba ang filename/path
import User from "./models/user.js";               // idinagdag: wala ito dati

app.get("/api/reports/stats", async (req, res) => {
    try {
        const [totalAppointments, totalClients, pending, completed] = await Promise.all([
            Appointment.countDocuments({}),
            User.countDocuments({ role: { $regex: /^client$/i } }),
            Appointment.countDocuments({ status: { $regex: /^pending$/i } }),
            Appointment.countDocuments({ status: { $regex: /^completed$/i } })
        ]);
        res.json({ success: true, totalAppointments, totalClients, pending, completed });
    } catch (error) {
        console.error("Stats error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});