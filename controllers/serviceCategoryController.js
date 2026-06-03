import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create Category
export const createServiceCategory = async (req, res) => {
  try {
    const { name, isCustom } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const existingCategory =
      await prisma.serviceCategory.findFirst({
        where: {
          name: name.trim(),
        },
      });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const category =
      await prisma.serviceCategory.create({
        data: {
          name: name.trim(),
          isCustom: isCustom || false,
          status: 1,
        },
      });

    return res.status(201).json({
      success: true,
      message: "Service category created successfully",
      data: category,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get All Categories
export const getServiceCategories = async (req, res) => {
  try {
    const categories =
      await prisma.serviceCategory.findMany({
        orderBy: {
          id: "desc",
        },
      });

    return res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

//Get Category By Id
export const getServiceCategoryById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const category =
      await prisma.serviceCategory.findUnique({
        where: {
          id,
        },
      });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update Category
export const updateServiceCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      name,
      isCustom,
      status,
    } = req.body;

    const category =
      await prisma.serviceCategory.findUnique({
        where: { id },
      });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (name) {
      const duplicate =
        await prisma.serviceCategory.findFirst({
          where: {
            name: name.trim(),
            NOT: {
              id,
            },
          },
        });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists",
        });
      }
    }

    const updatedCategory =
      await prisma.serviceCategory.update({
        where: {
          id,
        },
        data: {
          ...(name && {
            name: name.trim(),
          }),

          ...(isCustom !== undefined && {
            isCustom,
          }),

          ...(status !== undefined && {
            status,
          }),
        },
      });

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Delete Category 
export const deleteServiceCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const category = await prisma.serviceCategory.findUnique({
      where: {
        id,
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await prisma.serviceCategory.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


 //Active Categories Dropdown API
export const getActiveServiceCategories =
  async (req, res) => {
    try {
      const categories =
        await prisma.serviceCategory.findMany({
          where: {
            status: 1,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        });

      return res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.log(error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };