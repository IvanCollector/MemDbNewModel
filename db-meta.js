var dbMeta = {
  "databases": [
    {
      "id": 1,
      "name": "db1",
      "roots": [
        {
          "id": 1,
          "name": "db1-root1",
          "data": {
            "0": 1,
            "1": 2,
            "2": 3,
            "3": 4,
            "4": 5
          }
        },
        {
          "id": 2,
          "name": "db1-root2",
          "data": {
            "0": 1,
            "1": 2,
            "2": 3,
            "3": 4,
            "4": 5
          }
        }
      ]
    },
    {
      "id": 2,
      "name": "db2",
      "master": 1,
      "roots": [{
        "id": 1,
        "master": 1,
        "name": "db2-root1"
      }, {
        "id": 2,
        "name": "db2-root2",
        "data": {
          "0": 1,
          "1": 2,
          "2": 3,
          "3": 4,
          "4": 5
        }
      }]
    },
    {
      "id": 3,
      "name": "db3",
      "master": 1,
      "roots": [{
        "id": 1,
        "name": "db3-root1",
        "master": 1
      }]
    },
    {
      "id": 4,
      "name": "db4",
      "master": 3,
      "roots": [{
        "id": 1,
        "name": "db4-root1",
        "master": 1
      }]
    }
  ]
}