const { CustomField, Project, TaskCustomField, Task } = require('../models');
const logger = require('../utils/logger');

/**
 * @desc    Get all custom fields for a project
 * @route   GET /api/v1/projects/:projectId/custom-fields
 * @access  Private
 */
const getCustomFields = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const customFields = await CustomField.findAll({
      where: { projectId },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name']
        }
      ],
      order: [['position', 'ASC']]
    });

    res.status(200).json({
      success: true,
      count: customFields.length,
      data: customFields
    });
  } catch (error) {
    logger.error('Get custom fields error:', error);
    next(error);
  }
};

/**
 * @desc    Create custom field
 * @route   POST /api/v1/projects/:projectId/custom-fields
 * @access  Private
 */
const createCustomField = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, type, options, isRequired, position } = req.body;

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Validate type-specific requirements
    if ((type === 'dropdown' || type === 'multi_select') && (!options || !Array.isArray(options) || options.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Dropdown and multi_select types require options array'
      });
    }

    // Get max position
    const maxPosition = await CustomField.max('position', {
      where: { projectId }
    }) || 0;

    const customField = await CustomField.create({
      name,
      type,
      projectId,
      options: options || null,
      isRequired: isRequired || false,
      position: position !== undefined ? position : maxPosition + 1
    });

    res.status(201).json({
      success: true,
      data: customField
    });
  } catch (error) {
    logger.error('Create custom field error:', error);
    next(error);
  }
};

/**
 * @desc    Update custom field
 * @route   PUT /api/v1/custom-fields/:id
 * @access  Private
 */
const updateCustomField = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, options, isRequired, position } = req.body;

    const customField = await CustomField.findByPk(id);
    if (!customField) {
      return res.status(404).json({
        success: false,
        error: 'Custom field not found'
      });
    }

    // Validate type-specific requirements
    if ((type === 'dropdown' || type === 'multi_select') && (!options || !Array.isArray(options) || options.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Dropdown and multi_select types require options array'
      });
    }

    await customField.update({
      name: name !== undefined ? name : customField.name,
      type: type !== undefined ? type : customField.type,
      options: options !== undefined ? options : customField.options,
      isRequired: isRequired !== undefined ? isRequired : customField.isRequired,
      position: position !== undefined ? position : customField.position
    });

    res.status(200).json({
      success: true,
      data: customField
    });
  } catch (error) {
    logger.error('Update custom field error:', error);
    next(error);
  }
};

/**
 * @desc    Delete custom field
 * @route   DELETE /api/v1/custom-fields/:id
 * @access  Private
 */
const deleteCustomField = async (req, res, next) => {
  try {
    const { id } = req.params;

    const customField = await CustomField.findByPk(id);
    if (!customField) {
      return res.status(404).json({
        success: false,
        error: 'Custom field not found'
      });
    }

    // Delete all task custom field values
    await TaskCustomField.destroy({
      where: { customFieldId: id }
    });

    await customField.destroy();

    res.status(200).json({
      success: true,
      message: 'Custom field deleted successfully'
    });
  } catch (error) {
    logger.error('Delete custom field error:', error);
    next(error);
  }
};

/**
 * @desc    Set custom field value for a task
 * @route   PUT /api/v1/tasks/:taskId/custom-fields/:customFieldId
 * @access  Private
 */
const setTaskCustomFieldValue = async (req, res, next) => {
  try {
    const { taskId, customFieldId } = req.params;
    const { value } = req.body;

    // Verify task and custom field exist
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const customField = await CustomField.findByPk(customFieldId);
    if (!customField) {
      return res.status(404).json({
        success: false,
        error: 'Custom field not found'
      });
    }

    // Verify custom field belongs to task's project
    if (customField.projectId !== task.projectId) {
      return res.status(400).json({
        success: false,
        error: 'Custom field does not belong to task\'s project'
      });
    }

    // Validate value based on type
    if (customField.isRequired && (!value || value === '')) {
      return res.status(400).json({
        success: false,
        error: 'This field is required'
      });
    }

    // Validate dropdown/multi_select values
    if ((customField.type === 'dropdown' || customField.type === 'multi_select') && customField.options) {
      if (customField.type === 'dropdown') {
        if (!customField.options.includes(value)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid value for dropdown field'
          });
        }
      } else if (customField.type === 'multi_select') {
        const values = Array.isArray(value) ? value : JSON.parse(value || '[]');
        const invalidValues = values.filter(v => !customField.options.includes(v));
        if (invalidValues.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid values for multi_select field'
          });
        }
        value = JSON.stringify(values);
      }
    }

    // Create or update task custom field value
    const [taskCustomField, created] = await TaskCustomField.findOrCreate({
      where: { taskId, customFieldId },
      defaults: { value: typeof value === 'object' ? JSON.stringify(value) : value }
    });

    if (!created) {
      await taskCustomField.update({
        value: typeof value === 'object' ? JSON.stringify(value) : value
      });
    }

    // Reload with associations
    await taskCustomField.reload({
      include: [
        {
          model: CustomField,
          as: 'customField'
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: taskCustomField
    });
  } catch (error) {
    logger.error('Set task custom field value error:', error);
    next(error);
  }
};

/**
 * @desc    Get custom field values for a task
 * @route   GET /api/v1/tasks/:taskId/custom-fields
 * @access  Private
 */
const getTaskCustomFields = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const taskCustomFields = await TaskCustomField.findAll({
      where: { taskId },
      include: [
        {
          model: CustomField,
          as: 'customField',
          attributes: ['id', 'name', 'type', 'options', 'isRequired']
        }
      ]
    });

    res.status(200).json({
      success: true,
      count: taskCustomFields.length,
      data: taskCustomFields
    });
  } catch (error) {
    logger.error('Get task custom fields error:', error);
    next(error);
  }
};

module.exports = {
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  setTaskCustomFieldValue,
  getTaskCustomFields
};


