import type { DependencyGraph, ProjectGraph } from "./types";

export const graphData: ProjectGraph = {
  "files":  [
    {
      imports: ["import math"],
      functions: [
        {
          name: "area_of_circle",
          parameters: [{ name: "r", param_type: "float", default_value: null }],
          return_type: "float"
        },
        {
          name: "hypotenuse",
          parameters: [
            { name: "a", param_type: "float", default_value: null },
            { name: "b", param_type: "float", default_value: null }
          ],
          return_type: "float"
        },
        {
          name: "volume",
          parameters: [
            { name: "a", param_type: "float", default_value: null },
            { name: "b", param_type: "float", default_value: null },
            { name: "c", param_type: "float", default_value: "0" }
          ],
          return_type: "float"
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
              return_type: null
            },
            {
              name: "describe",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "str"
            }
          ]
        }
      ],
      file_name: "/home/franco/Escritorio/proyecto/geometry_utils.py"
    },
    {
      imports: ["import math", "from collections import Counter"],
      functions: [
        {
          name: "mean",
          parameters: [
            { name: "values", param_type: "list[float]", default_value: null }
          ],
          return_type: "float"
        },
        {
          name: "median",
          parameters: [
            { name: "values", param_type: "list[float]", default_value: null }
          ],
          return_type: "float"
        },
        {
          name: "mode",
          parameters: [
            { name: "values", param_type: "list[int]", default_value: null }
          ],
          return_type: "int"
        },
        {
          name: "variance",
          parameters: [
            { name: "values", param_type: "list[float]", default_value: null }
          ],
          return_type: "float"
        }
      ],
      file_name: "/home/franco/Escritorio/proyecto/geometry_utils.py",
      classes: [
        {
          name: "StatsAnalyzer",
          methods: [
            {
              name: "__init__",
              parameters: [
                { name: "self", param_type: null, default_value: null },
                { name: "data", param_type: "list[float]", default_value: null }
              ],
              return_type: null
            },
            {
              name: "summary",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "dict"
            },
            {
              name: "standard_deviation",
              parameters: [{ name: "self", param_type: null, default_value: null }],
              return_type: "float"
            }
          ]
        }
      ]
    }
  ]
};
