import express from "express";
import Inventory from "../models/Inventory.js";

const router = express.Router();


// ======================================================
// GET /api/inventory  -> all items (empty array if none)
// ======================================================

router.get("/", async (req, res) => {

    try {

        const items = await Inventory.find().sort({ name: 1 });

        return res.json(items);

    } catch (error) {

        console.error("List inventory error:", error);

        return res.status(500).json({
            error: "Failed to load inventory"
        });
    }
});


// ======================================================
// GET /api/inventory/:id
// ======================================================

router.get("/:id", async (req, res) => {

    try {

        const item = await Inventory.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }

        return res.json(item);

    } catch (error) {

        console.error("Get inventory item error:", error);

        return res.status(500).json({ error: "Failed to load item" });
    }
});


// ======================================================
// POST /api/inventory  -> add item
// ======================================================

router.post("/", async (req, res) => {

    try {

        const { name, category, quantity, reorderLevel } = req.body;

        if (!name || !category) {
            return res.status(400).json({ error: "Name and category are required" });
        }

        const qty = Number(quantity);
        const level = Number(reorderLevel);

        // Allow 0 as a valid Low Stock Alert; only fall back to 5 when empty/invalid
        const item = await Inventory.create({
            name: name,
            category: category,
            quantity: Number.isFinite(qty) && qty >= 0 ? qty : 0,
            reorderLevel: Number.isFinite(level) && level >= 0 ? level : 5
        });

        return res.status(201).json(item);

    } catch (error) {

        console.error("Create inventory item error:", error);

        return res.status(500).json({ error: "Failed to save item" });
    }
});


// ======================================================
// PATCH /api/inventory/:id/quantity  -> the + and - buttons
// ======================================================

router.patch("/:id/quantity", async (req, res) => {

    try {

        const change = Number(req.body.change);

        if (!change || isNaN(change)) {
            return res.status(400).json({ error: "A non-zero numeric change is required" });
        }

        const item = await Inventory.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }

        const newQuantity = item.quantity + change;

        if (newQuantity < 0) {
            return res.status(400).json({ error: "Quantity cannot go below zero" });
        }

        item.quantity = newQuantity;

        await item.save();

        return res.json(item);

    } catch (error) {

        console.error("Update quantity error:", error);

        return res.status(500).json({ error: "Failed to update quantity" });
    }
});


export default router;