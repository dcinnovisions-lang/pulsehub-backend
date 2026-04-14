const { Workflow, Project, Status } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Get workflows for a project
 * @route   GET /api/v1/workflows
 * @access  Private
 */
const getWorkflows = async (req, res, next) => {
  try {
    const { projectId, isTemplate } = req.query;

    const whereClause = {};
    if (projectId) {
      whereClause.projectId = projectId;
    }
    if (isTemplate !== undefined) {
      whereClause.isTemplate = isTemplate === 'true';
    }

    const workflows = await Workflow.findAll({
      where: whereClause,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: workflows.length,
      data: workflows
    });
  } catch (error) {
    logger.error('Get workflows error:', error);
    next(error);
  }
};

/**
 * @desc    Get workflow by ID
 * @route   GET /api/v1/workflows/:id
 * @access  Private
 */
const getWorkflowById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const workflow = await Workflow.findByPk(id, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Get workflow error:', error);
    next(error);
  }
};

/**
 * @desc    Create workflow
 * @route   POST /api/v1/workflows
 * @access  Private
 */
const createWorkflow = async (req, res, next) => {
  try {
    const {
      name,
      projectId,
      definition,
      isTemplate,
      isActive
    } = req.body;

    // Verify project exists
    if (projectId && !isTemplate) {
      const project = await Project.findByPk(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      // Check if project already has a workflow
      const existing = await Workflow.findOne({
        where: { projectId, isActive: true }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Project already has an active workflow'
        });
      }
    }

    const workflow = await Workflow.create({
      name,
      projectId: projectId || null,
      definition: definition || null,
      isTemplate: isTemplate || false,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Create workflow error:', error);
    next(error);
  }
};

/**
 * @desc    Update workflow
 * @route   PUT /api/v1/workflows/:id
 * @access  Private
 */
const updateWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      definition,
      isActive
    } = req.body;

    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    await workflow.update({
      name: name !== undefined ? name : workflow.name,
      definition: definition !== undefined ? definition : workflow.definition,
      isActive: isActive !== undefined ? isActive : workflow.isActive
    });

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Update workflow error:', error);
    next(error);
  }
};

/**
 * @desc    Delete workflow
 * @route   DELETE /api/v1/workflows/:id
 * @access  Private
 */
const deleteWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;

    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    await workflow.destroy();

    res.status(200).json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    logger.error('Delete workflow error:', error);
    next(error);
  }
};

/**
 * @desc    Get workflow templates
 * @route   GET /api/v1/workflows/templates
 * @access  Private
 */
const getWorkflowTemplates = async (req, res, next) => {
  try {
    const templates = await Workflow.findAll({
      where: { isTemplate: true },
      order: [['name', 'ASC']]
    });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    logger.error('Get workflow templates error:', error);
    next(error);
  }
};

/**
 * @desc    Apply workflow template to project
 * @route   POST /api/v1/workflows/:id/apply
 * @access  Private
 */
const applyWorkflowTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { projectId } = req.body;

    const template = await Workflow.findByPk(id);

    if (!template || !template.isTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Workflow template not found'
      });
    }

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check if project already has a workflow
    const existing = await Workflow.findOne({
      where: { projectId, isActive: true }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Project already has an active workflow'
      });
    }

    // Create workflow from template
    const workflow = await Workflow.create({
      name: template.name,
      projectId,
      definition: template.definition,
      isTemplate: false,
      isActive: true
    });

    // Create statuses from workflow definition if provided
    if (template.definition && template.definition.statuses) {
      for (const statusDef of template.definition.statuses) {
        await Status.create({
          name: statusDef.name,
          projectId,
          color: statusDef.color,
          position: statusDef.position || 0,
          isDefault: statusDef.isDefault || false
        });
      }
    }

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Apply workflow template error:', error);
    next(error);
  }
};

module.exports = {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflowTemplates,
  applyWorkflowTemplate
};




