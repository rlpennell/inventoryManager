const Item = require('../models/item');
const Category = require('../models/category');

const async = require('async');
const { body, validationResult } = require('express-validator');

exports.index = (req, res, next) => {
  async.parallel(
    {
      totalItems: callback => Item.countDocuments({}, callback),
      totalCategories: callback => Category.countDocuments({}, callback),
      itemImages: callback =>
        Item.find({ image: { $exists: true } })
          .limit(5)
          .exec(callback),
    },
    (err, { totalItems, totalCategories, itemImages }) => {
      if (err) return next(err);

      res.render('index', {
        title: 'Inventory Manager',
        totalCategories,
        totalItems,
        itemImages,
      });
    }
  );
};

exports.search_results = (req, res, next) => {
  async.parallel(
    {
      items: callback =>
        Item.aggregate([
          {
            $search: {
              index: 'items',
              wildcard: {
                query: `${req.query.search}*`,
                path: {
                  wildcard: '*',
                },
                allowAnalyzedField: true,
              },
            },
          },
          {
            $lookup: {
              from: 'categories',
              localField: 'category',
              foreignField: '_id',
              as: 'category',
            },
          },
        ]).exec(callback),
      categories: callback =>
        Category.aggregate([
          [
            {
              $search: {
                index: 'categories',
                wildcard: {
                  query: `${req.query.search}*`,
                  path: {
                    wildcard: '*',
                  },
                  allowAnalyzedField: true,
                },
              },
            },
          ],
        ]).exec(callback),
    },
    (err, { items, categories }) => {
      if (err) return next(err);
      const results = [...items, ...categories];
      console.log(results);
      res.render('search_results', { title: 'Search', results });
    }
  );
};

exports.item_list = (req, res, next) => {
  Item.find({})
    .populate('category')
    .exec((err, item_list) => {
      if (err) return next(err);

      res.render('item_list', { title: 'All items', item_list });
    });
};

exports.item_detail = (req, res, next) => {
  Item.findById(req.params.id)
    .populate('category')
    .exec((err, item) => {
      if (err) return next(err);

      if (!item) {
        let err = new Error('Item not found');
        err.status = 404;
        next(err);
      }

      res.render('item_detail', { title: `Item Detail: ${item.name}`, item });
    });
};

exports.item_create_get = (req, res, next) => {
  Category.find().exec((err, categories) => {
    if (err) return next(err);

    res.render('item_form', { title: 'Create Item', categories, errors: [] });
  });
};

exports.item_create_post = [
  (req, res, next) => {
    if (!(req.body.category instanceof Array)) {
      if (typeof req.body.category === 'undefined') req.body.category = [];
      else req.body.category = new Array(req.body.category);
    }
    next();
  },
  body('name', 'Name is required')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Name must be at least 3 characters')
    .escape(),
  body('description')
    .trim()
    .isLength({ min: 1 })
    .escape()
    .withMessage('Description is required.'),
  body('price', 'Price is required').isFloat({ min: 0 }),
  body('in_stock', 'Number in stock is required').isInt({ min: 0 }),
  (req, res, next) => {
    const errors = validationResult(req);

    const { name, description, category, price, in_stock } = req.body;

    let item = new Item({
      name,
      description,
      category,
      price,
      in_stock,
      image: req.file.filename,
    });

    if (!errors.isEmpty()) {
      Category.find().exec((err, categories) => {
        if (err) return next(err);

        categories = categories.map(category =>
          item.category.indexOf(category._id) > -1
            ? Object.assign(category, { checked: true })
            : category
        );

        res.render('item_form', {
          title: 'Create Item',
          item,
          categories,
          errors: errors.array(),
        });
      });
    } else {
      item.save(err => {
        if (err) return next(err);

        res.redirect(item.url);
      });
    }
  },
];

exports.item_delete_get = (req, res, next) => {
  Item.findById(req.params.id).exec((err, item) => {
    if (err) return next(err);

    if (!item) res.redirect('/inventory/items');

    res.render('item_delete', { title: `Delete ${item.name}`, item });
  });
};

exports.item_delete_post = (req, res, next) => {
  Item.findByIdAndRemove(req.params.id, err => {
    if (err) return next(err);
    res.redirect('/inventory/items');
  });
};

exports.item_update_get = (req, res, err) => {
  async.parallel(
    {
      item: callback => Item.findById(req.params.id).exec(callback),
      categories: callback => Category.find(callback),
    },
    (err, { item, categories }) => {
      if (err) return next(err);

      categories = categories.map(category =>
        item.category.indexOf(category._id) > -1
          ? Object.assign(category, { checked: true })
          : category
      );

      console.log(item);

      res.render('item_form', {
        title: 'Update Item',
        item,
        categories,
        errors: [],
      });
    }
  );
};

exports.item_update_post = [
  (req, res, next) => {
    if (!(req.body.category instanceof Array)) {
      if (typeof req.body.category === 'undefined') req.body.category = [];
      else req.body.category = new Array(req.body.category);
    }
    next();
  },
  body('name', 'Name is required')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Name must be at least 3 characters')
    .escape(),
  body('description')
    .trim()
    .isLength({ min: 1 })
    .escape()
    .withMessage('Description is required.'),
  body('price', 'Price is required').isFloat({ min: 0 }),
  body('in_stock', 'Number in stock is required').isInt({ min: 0 }),

  (req, res, next) => {
    Item.findById(req.params.id).exec((err, oldItem) => {
      const errors = validationResult(req);

      const { name, description, category, price, in_stock } = req.body;

      let item = new Item({
        name,
        description,
        category,
        price,
        in_stock,
        image: req.file
          ? req.file.filename
          : oldItem.image
          ? oldItem.image
          : null,
        _id: req.params.id,
      });

      if (!errors.isEmpty()) {
        Category.find().exec((err, categories) => {
          if (err) return next(err);

          categories = categories.map(category =>
            item.category.indexOf(category._id) > -1
              ? Object.assign(category, { checked: true })
              : category
          );

          res.render('item_form', {
            title: 'Update Item',
            item,
            categories,
            errors: errors.array(),
          });
        });
      } else {
        Item.findByIdAndUpdate(req.params.id, item, {}, (err, updatedItem) => {
          if (err) return next(err);
          res.redirect(updatedItem.url);
        });
      }
    });
  },
];
