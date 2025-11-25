const cloudinary = require("../config/cloudinary");

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
]);
const uploadImageController = async (req, res) => {
    try {
        if (!req.file){
            return res.status(400).json({ message: "No file uploaded", success: false });
        }

        if (!allowedMimeTypes.has(req.file.mimetype)){
            return res.status(400).json({ message: "Only images or PDF allowed", success: false });
        }

        const uploaded = await cloudinary(req.file, "Association");

        return res.status(200).json({
            message: "Upload successful",
            url: uploaded.url,
            public_id: uploaded.public_id,
            success: true,
        });
    } catch (error) {
        console.error("uploadImageController error:", error);
        return res.status(500).json({
            message: error?.message || "Upload failed",
            success: false,
        });
    }
};

module.exports = { uploadImageController };