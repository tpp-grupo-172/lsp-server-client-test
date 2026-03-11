//src/lib/mockData.js
export const mockTreeSitterData = {
  files: [
    {
      path: "projecto/validators.py",
      name: "validators.py",
      imports: [
        { name: "re", path: null }
      ],
      functions: [
        {
          name: "validate_email",
          parameters: [
            { name: "email", param_type: "str", default_value: null },
            { name: "p", param_type: "str", default_value: null }
          ],
          return_type: "bool",
          function_calls: [
            { name: "bool", import_name: null },
            { name: "match", import_name: "re" }
          ]
        },
        {
          name: "validate_age",
          parameters: [{ name: "age", param_type: "int", default_value: null }],
          return_type: "bool",
          function_calls: []
        },
        {
          name: "validate_price",
          parameters: [{ name: "price", param_type: "float", default_value: null }],
          return_type: "bool",
          function_calls: []
        },
        {
          name: "validate_quantity",
          parameters: [{ name: "quantity", param_type: "int", default_value: null }],
          return_type: "bool",
          function_calls: []
        }
      ],
      classes: []
    },
    {
      path: "main.py",
      name: "main.py",
      imports: [
        { name: "api.users", path: "projecto/users.py" },
        { name: "api.shop", path: "projecto/shop.py" }
      ],
      functions: [
        {
          name: "main",
          parameters: [],
          return_type: null,
          function_calls: [
            { name: "register_user", import_name: "api.users" },
            { name: "print", import_name: null },
            { name: "add_product", import_name: "api.shop" },
            { name: "print", import_name: null },
            { name: "get_discounted_price", import_name: "api.shop" },
            { name: "print", import_name: null },
            { name: "place_order", import_name: "api.shop" },
            { name: "print", import_name: null }
          ]
        }
      ],
      classes: []
    },
    {
      path: "projecto/notification.py",
      name: "notification.py",
      imports: [
        { name: "utils.formatters", path: "projecto/formatters.py" }
      ],
      functions: [
        {
          name: "send_order_confirmation",
          parameters: [
            { name: "email", param_type: "str", default_value: null },
            { name: "product_name", param_type: "str", default_value: null },
            { name: "total", param_type: "float", default_value: null }
          ],
          return_type: "bool",
          function_calls: [
            { name: "format_currency", import_name: "utils.formatters" },
            { name: "print", import_name: null }
          ]
        },
        {
          name: "send_welcome_email",
          parameters: [
            { name: "email", param_type: "str", default_value: null },
            { name: "name", param_type: "str", default_value: null }
          ],
          return_type: "bool",
          function_calls: [{ name: "print", import_name: null }]
        },
        {
          name: "send_stock_alert",
          parameters: [
            { name: "product_name", param_type: "str", default_value: null },
            { name: "stock", param_type: "int", default_value: null }
          ],
          return_type: "bool",
          function_calls: [{ name: "print", import_name: null }]
        },
        {
          name: "hola",
          parameters: [],
          return_type: "bool",
          function_calls: []
        }
      ],
      classes: []
    },
    {
      path: "projecto/formatters.py",
      name: "formatters.py",
      imports: [],
      functions: [
        {
          name: "format_currency",
          parameters: [
            { name: "amount", param_type: "float", default_value: null },
            { name: "symbol", param_type: "str", default_value: "\"$\"" }
          ],
          return_type: "str",
          function_calls: []
        },
        {
          name: "format_name",
          parameters: [
            { name: "first", param_type: "str", default_value: null },
            { name: "last", param_type: "str", default_value: null }
          ],
          return_type: "str",
          function_calls: [
            { name: "strip()", import_name: "first" },
            { name: "strip", import_name: "first" },
            { name: "strip()", import_name: "last" },
            { name: "strip", import_name: "last" }
          ]
        },
        {
          name: "format_percentage",
          parameters: [{ name: "value", param_type: "float", default_value: null }],
          return_type: "str",
          function_calls: []
        }
      ],
      classes: []
    },
    {
      path: "projecto/users.py",
      name: "users.py",
      imports: [
        { name: "core.user", path: "projecto/user.py" },
        { name: "services.notification", path: "projecto/notification.py" }
      ],
      functions: [
        {
          name: "register_user",
          parameters: [
            { name: "name", param_type: "str", default_value: null },
            { name: "email", param_type: "str", default_value: null },
            { name: "age", param_type: "int", default_value: null }
          ],
          return_type: "dict",
          function_calls: [
            { name: "create_user", import_name: "core.user" },
            { name: "send_welcome_email", import_name: "services.notification" },
            { name: "get_user_summary", import_name: "core.user" }
          ]
        },
        {
          name: "get_user_profile",
          parameters: [
            { name: "name", param_type: "str", default_value: null },
            { name: "email", param_type: "str", default_value: null },
            { name: "age", param_type: "int", default_value: null }
          ],
          return_type: "dict",
          function_calls: [
            { name: "create_user", import_name: "core.user" },
            { name: "get_user_summary", import_name: "core.user" }
          ]
        },
        {
          name: "deactivate_user",
          parameters: [{ name: "email", param_type: "str", default_value: null }],
          return_type: "bool",
          function_calls: [{ name: "print", import_name: null }]
        }
      ],
      classes: []
    },
    {
      path: "projecto/product.py",
      name: "product.py",
      imports: [
        { name: "utils.validators", path: "projecto/validators.py" },
        { name: "utils.formatters", path: "projecto/formatters.py" }
      ],
      functions: [
        {
          name: "create_product",
          parameters: [
            { name: "name", param_type: "str", default_value: null },
            { name: "price", param_type: "float", default_value: null },
            { name: "stock", param_type: "int", default_value: null }
          ],
          return_type: "Product",
          function_calls: [
            { name: "validate_price", import_name: "utils.validators" },
            { name: "ValueError", import_name: null },
            { name: "Product", import_name: null }
          ]
        },
        {
          name: "apply_discount",
          parameters: [
            { name: "product", param_type: "Product", default_value: null },
            { name: "percent", param_type: "float", default_value: null }
          ],
          return_type: "float",
          function_calls: [{ name: "round", import_name: null }]
        }
      ],
      classes: [
        {
          name: "Product",
          methods: [
            {
              name: "__init__",
              parameters: [
                { name: "self", param_type: null, default_value: null },
                { name: "name", param_type: "str", default_value: null },
                { name: "price", param_type: "float", default_value: null },
                { name: "stock", param_type: "int", default_value: null }
              ],
              return_type: null,
              function_calls: []
            },
            {
              name: "is_available",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "bool",
              function_calls: []
            },
            {
              name: "formatted_price",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "str",
              function_calls: [{ name: "format_currency", import_name: "utils.formatters" }]
            }
          ]
        }
      ]
    },
    {
      path: "projecto/user.py",
      name: "user.py",
      imports: [
        { name: "utils.validators", path: "projecto/validators.py" }
      ],
      functions: [
        {
          name: "create_user",
          parameters: [
            { name: "name", param_type: "str", default_value: null },
            { name: "email", param_type: "str", default_value: null },
            { name: "age", param_type: "int", default_value: null }
          ],
          return_type: "User",
          function_calls: [
            { name: "User", import_name: null },
            { name: "is_valid", import_name: "user" },
            { name: "ValueError", import_name: null }
          ]
        },
        {
          name: "get_user_summary",
          parameters: [{ name: "user", param_type: "User", default_value: null }],
          return_type: "dict",
          function_calls: [{ name: "is_valid", import_name: "user" }]
        }
      ],
      classes: [
        {
          name: "User",
          methods: [
            {
              name: "__init__",
              parameters: [
                { name: "self", param_type: null, default_value: null },
                { name: "name", param_type: "str", default_value: null },
                { name: "email", param_type: "str", default_value: null },
                { name: "age", param_type: "int", default_value: null }
              ],
              return_type: null,
              function_calls: []
            },
            {
              name: "is_valid",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "bool",
              function_calls: [
                { name: "validators", import_name: "utils" },
                { name: "validators", import_name: "utils" }
              ]
            }
          ]
        }
      ]
    },
    {
      path: "projecto/order.py",
      name: "order.py",
      imports: [
        { name: "core.user", path: "projecto/user.py" },
        { name: "core.product", path: "projecto/product.py" },
        { name: "utils.formatters", path: "projecto/formatters.py" },
        { name: "services.notification", path: "projecto/notification.py" }
      ],
      functions: [
        {
          name: "create_order",
          parameters: [
            { name: "user", param_type: "User", default_value: null },
            { name: "product", param_type: "Product", default_value: null },
            { name: "quantity", param_type: "int", default_value: null }
          ],
          return_type: "Order",
          function_calls: [
            { name: "is_available", import_name: "product" },
            { name: "ValueError", import_name: null },
            { name: "ValueError", import_name: null },
            { name: "Order", import_name: null }
          ]
        },
        {
          name: "process_order",
          parameters: [{ name: "order", param_type: "Order", default_value: null }],
          return_type: "dict",
          function_calls: [
            { name: "get_user_summary", import_name: "core.user" },
            { name: "send_order_confirmation", import_name: "services.notification" },
            { name: "total", import_name: "order" },
            { name: "formatted_total", import_name: "order" }
          ]
        }
      ],
      classes: [
        {
          name: "Order",
          methods: [
            {
              name: "__init__",
              parameters: [
                { name: "self", param_type: null, default_value: null },
                { name: "user", param_type: "User", default_value: null },
                { name: "product", param_type: "Product", default_value: null },
                { name: "quantity", param_type: "int", default_value: null }
              ],
              return_type: null,
              function_calls: []
            },
            {
              name: "total",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "float",
              function_calls: [
                { name: "apply_discount", import_name: "core.product" },
                { name: "round", import_name: null }
              ]
            },
            {
              name: "formatted_total",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "str",
              function_calls: [
                { name: "format_currency", import_name: "utils.formatters" },
                { name: "total", import_name: "self" }
              ]
            }
          ]
        }
      ]
    },
    {
      path: "projecto/shop.py",
      name: "shop.py",
      imports: [
        { name: "core.product", path: "projecto/product.py" },
        { name: "core.user", path: "projecto/user.py" },
        { name: "services.order", path: "projecto/order.py" },
        { name: "services.notification", path: "projecto/notification.py" },
        { name: "utils.formatters", path: "projecto/formatters.py" }
      ],
      functions: [
        {
          name: "add_product",
          parameters: [
            { name: "name", param_type: "str", default_value: null },
            { name: "price", param_type: "float", default_value: null },
            { name: "stock", param_type: "int", default_value: null }
          ],
          return_type: "dict",
          function_calls: [
            { name: "create_product", import_name: "core.product" },
            { name: "formatted_price", import_name: "product" }
          ]
        },
        {
          name: "place_order",
          parameters: [
            { name: "username", param_type: "str", default_value: null },
            { name: "email", param_type: "str", default_value: null },
            { name: "age", param_type: "int", default_value: null },
            { name: "product_name", param_type: "str", default_value: null },
            { name: "price", param_type: "float", default_value: null },
            { name: "stock", param_type: "int", default_value: null },
            { name: "quantity", param_type: "int", default_value: null }
          ],
          return_type: "dict",
          function_calls: [
            { name: "create_user", import_name: "core.user" },
            { name: "create_product", import_name: "core.product" },
            { name: "create_order", import_name: "services.order" },
            { name: "process_order", import_name: "services.order" },
            { name: "send_stock_alert", import_name: "services.notification" }
          ]
        },
        {
          name: "get_discounted_price",
          parameters: [
            { name: "product_name", param_type: "str", default_value: null },
            { name: "price", param_type: "float", default_value: null },
            { name: "stock", param_type: "int", default_value: null },
            { name: "discount", param_type: "float", default_value: null }
          ],
          return_type: "str",
          function_calls: [
            { name: "create_product", import_name: "core.product" },
            { name: "apply_discount", import_name: "core.product" },
            { name: "format_currency", import_name: null }
          ]
        }
      ],
      classes: []
    }
  ]
};