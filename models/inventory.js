import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true
    },

    category: {
        type: String,
        enum: ["Ink", "Needles", "Machines", "Accessories", "Sanitation", "Other"],
        default: "Other"
    },

    quantity: {
        type: Number,
        default: 0,
        min: 0
    },

    // Low Stock Alert: Low Stock na kapag quantity <= reorderLevel
    reorderLevel: {
        type: Number,
        default: 0,
        min: 0
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

// Derived from quantity vs reorderLevel, so it can never go out of sync
inventorySchema.virtual("status").get(function () {

    if (this.quantity <= 0) {
        return "Out of Stock";
    }

    if (this.quantity <= (this.reorderLevel || 0)) {
        return "Low Stock";
    }

    return "In Stock";
});

inventorySchema.set("toJSON", { virtuals: true });
inventorySchema.set("toObject", { virtuals: true });

const Inventory = mongoose.model("Inventory", inventorySchema);

export default Inventory;