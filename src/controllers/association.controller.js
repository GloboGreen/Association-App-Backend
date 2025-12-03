const Association = require("../models/association.model");
const cloudinary = require("../config/cloudinary");

/* Helper: upload buffer to Cloudinary */
const uploadToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/* POST /api/associations  (Admin) - Create */
const createAssociation = async (req, res) => {
  try {
    // ✅ also take `area`
    const { name, district, area, address = {} } = req.body;

    if (!name || !district || !area) {
      return res.status(400).json({
        success: false,
        message: "Name, district and area are required",
      });
    }

    // ✅ Support both `address.street` and `address[street]` style fields
    const normalizedAddress = {
      street:
        address.street ||
        req.body["address[street]"] ||
        "",
      area:
        address.area ||
        req.body["address[area]"] ||
        "",
      city:
        address.city ||
        req.body["address[city]"] ||
        "",
      state:
        address.state ||
        req.body["address[state]"] ||
        "",
      pincode:
        address.pincode ||
        req.body["address[pincode]"] ||
        "",
    };

    const data = {
      name,
      district,
      area,               // ✅ now sent to Mongoose
      address: normalizedAddress,
    };

    // Logo upload (optional)
    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        "Association/logos"
      );
      data.logo = uploaded.secure_url;
    }

    const association = await Association.create(data);

    res.status(201).json({
      success: true,
      message: "Association created successfully",
      data: association,
    });
  } catch (err) {
    console.error("createAssociation error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to create association" });
  }
};

/* GET /api/associations  - Get all */
const getAllAssociations = async (_req, res) => {
  try {
    const list = await Association.find().sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (err) {
    console.error("getAllAssociations error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch associations" });
  }
};

/* GET /api/associations/:id - Get single */
const getAssociationById = async (req, res) => {
  try {
    const item = await Association.findById(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Association not found" });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    console.error("getAssociationById error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch association" });
  }
};

/* PATCH /api/associations/:id (Admin) - Update */
const updateAssociation = async (req, res) => {
  try {
    const { name, district, area, address, isActive } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (district !== undefined) update.district = district;
    if (area !== undefined) update.area = area;
    if (isActive !== undefined) update.isActive = isActive;

    if (address || req.body["address[street]"]) {
      update.address = {
        street:
          address?.street ||
          req.body["address[street]"] ||
          "",
        area:
          address?.area ||
          req.body["address[area]"] ||
          "",
        city:
          address?.city ||
          req.body["address[city]"] ||
          "",
        state:
          address?.state ||
          req.body["address[state]"] ||
          "",
        pincode:
          address?.pincode ||
          req.body["address[pincode]"] ||
          "",
      };
    }

    // If new logo provided
    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        "Association/logos"
      );
      update.logo = uploaded.secure_url;
    }

    const item = await Association.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Association not found" });
    }

    res.json({
      success: true,
      message: "Association updated successfully",
      data: item,
    });
  } catch (err) {
    console.error("updateAssociation error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update association" });
  }
};

/* DELETE /api/associations/:id (Admin) - Hard delete */
const deleteAssociation = async (req, res) => {
  try {
    const item = await Association.findByIdAndDelete(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Association not found" });
    }

    res.json({
      success: true,
      message: "Association deleted successfully",
    });
  } catch (err) {
    console.error("deleteAssociation error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete association" });
  }
};

module.exports = {
  createAssociation,
  getAllAssociations,
  getAssociationById,
  updateAssociation,
  deleteAssociation,
};
