import express from "express";

const router = express.Router();

const STYLES = {
    japanese: "Japanese",
    tribal: "Tribal",
    mechanical: "Mechanical",
    anime: "Anime",
    blackwork: "Blackwork"
};

router.get("/landingpage", (req, res) => {
    res.render("landingpage");
});

router.get("/about", (req, res) => {
    res.render("aboutpublic");
});

router.get("/photopublic", (req, res) => {
    res.redirect("/photopublic/japanese");
});

router.get("/photopublic/:style", (req, res) => {
    const key = String(req.params.style || "").toLowerCase();

    if (!STYLES[key]) {
        return res.redirect("/photopublic/japanese");
    }

    res.render("photopublic", {
        styleKey: key,
        styleName: STYLES[key],
        styles: STYLES
    });
});

export default router;