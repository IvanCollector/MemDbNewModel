var dbMeta = null;

var smallExample = {
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
          "0": 6,
          "1": 7,
          "2": 8,
          "3": 9,
          "4": 10
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
      "master": 2,
      "roots": [{
        "id": 1,
        "name": "db4-root1",
        "master": 1
      }, {
        "id": 2,
        "name": "db4-root2",
        "master": 2
      }]
    },
    {
      "id": 5,
      "name": "db5",
      "master": 2,
      "roots": [
        {
          "id": 1,
          "name": "db5-root1",
          "master": 1
        }
      ]
    },
    {
      "id": 6,
      "name": "db6",
      "master": 2,
      "roots": [
        {
          "id": 1,
          "name": "db6-root1",
          "master": 2
        }
      ]
    }
  ]
};

var bigExample = {
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
        "master": 2
      }]
    },
    {
      "id": 4,
      "name": "db4",
      "master": 2,
      "roots": [{
        "id": 1,
        "name": "db4-root1",
        "master": 1
      }]
    },
    {
      "id": 5,
      "name": "db5",
      "master": 2,
      "roots": [
        {
          "id": 1,
          "name": "db5-root1",
          "master": 1
        },{
          "id": 2,
          "name": "db5-root2",
          "master": 2
        }
      ]
    },
    {
      "id": 6,
      "name": "db6",
      "master": 3,
      "roots": [
        {
          "id": 1,
          "name": "db6-root1",
          "master": 1
        }
      ]
    },
    {
      "id": 7,
      "name": "db7",
      "master": 3,
      "roots": [
        {
          "id": 1,
          "name": "db6-root1",
          "master": 1
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
      "id": 8,
      "name": "db8",
      "master": 5,
      "roots": [
        {
          "id": 1,
          "name": "db8-root1",
          "master": 1
        },
        {
          "id": 2,
          "name": "db8-root2",
          "master": 2
        }
      ]
    },
    {
      "id": 9,
      "name": "db9",
      "master": 5,
      "roots": [
        {
          "id": 1,
          "name": "db9-root1",
          "master": 1
        },
        {
          "id": 2,
          "name": "db9-root2",
          "master": 2
        }
      ]
    },
    {
      "id": 10,
      "name": "db10",
      "master": 7,
      "roots": [
        {
          "id": 1,
          "name": "db10-root1",
          "master": 1
        },
        {
          "id": 2,
          "name": "db10-root2",
          "master": 2
        }
      ]
    }
  ]
};

