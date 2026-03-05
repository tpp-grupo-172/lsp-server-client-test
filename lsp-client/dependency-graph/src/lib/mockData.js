// src/lib/mockData.js
export const mockTreeSitterData = {
  files: [
    {
      path: "folder1/file1.py",
      name: "file1.py",
      imports: [
        {
          name: "file2",
          path: "folder1/file2.py"
        }
      ],
      functions: [
        {
          name: "saludar",
          parameters: [],
          return_type: null,
          function_calls: [
            { name: "hola", import_name: null },
            { name: "count", import_name: "chau()" },
            { name: "chau", import_name: null }
          ]
        },
        {
          name: "area_of_circle",
          parameters: [
            { name: "r", param_type: null, default_value: "0" }
          ],
          return_type: null,
          function_calls: []
        },
        {
          name: "hypotenuse",
          parameters: [
            { name: "a", param_type: "int", default_value: null },
            { name: "b", param_type: "str", default_value: "\"hola\"" }
          ],
          return_type: null,
          function_calls: [
            { name: "sqrt", import_name: "math" }
          ]
        },
        {
          name: "volume",
          parameters: [
            { name: "a", param_type: null, default_value: null },
            { name: "b", param_type: "int", default_value: null },
            { name: "c", param_type: "int", default_value: "0" },
            { name: "d", param_type: null, default_value: "2" }
          ],
          return_type: null,
          function_calls: []
        }
      ],
      classes: [
        {
          name: "Geometry",
          methods: [
            {
              name: "__init__",
              parameters: [
                { name: "self", param_type: null, default_value: null },
                { name: "shape_name", param_type: "str", default_value: null }
              ],
              return_type: null,
              function_calls: []
            },
            {
              name: "describe",
              parameters: [
                { name: "self", param_type: null, default_value: null }
              ],
              return_type: null,
              function_calls: [
                { name: "print", import_name: null }
              ]
            }
          ]
        }
      ]
    },
    {
      path: "folder1/file2.py",
      name: "file2.py",
      imports: [],
      functions: [
        {
          name: "hola",
          parameters: [],
          return_type: null,
          function_calls: []
        },
        {
          name: "chau",
          parameters: [],
          return_type: null,
          function_calls: []
        }
      ],
      classes: []
    },
  ]
};