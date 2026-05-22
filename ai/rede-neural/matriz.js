export default class Matrix {
    constructor(rows, columns, content = null) {
        this.rows = rows
        this.columns = columns
        this.content = content || Array.from({ length: rows }, () => Array(columns).fill(0))
    }

    static fromArray(array) {
        const matrix = new Matrix(array.length, 1)

        return matrix.map((value, row) => array[row])
    }

    static toArray(matrix) {
        const array = []

        matrix.map(value => {
            array.push(value)
            return value
        })

        return array
    }

    static map(matrix, callback) {
        return new Matrix(matrix.rows, matrix.columns).map((value, row, column) => {
            return callback(matrix.content[row][column], row, column)
        })
    }

    map(callback) {
        this.content = this.content.map((rowValues, row) => {
            return rowValues.map((value, column) => callback(value, row, column))
        })

        return this
    }

    static add(first, second) {
        return Matrix.map(first, (value, row, column) => value + second.content[row][column])
    }

    static subtract(first, second) {
        return Matrix.map(first, (value, row, column) => value - second.content[row][column])
    }

    static hadamard(first, second) {
        return Matrix.map(first, (value, row, column) => value * second.content[row][column])
    }

    static scalarMultiply(matrix, scalar) {
        return Matrix.map(matrix, value => value * scalar)
    }

    static transpose(matrix) {
        return new Matrix(matrix.columns, matrix.rows).map((value, row, column) => {
            return matrix.content[column][row]
        })
    }

    static multiply(first, second) {
        return new Matrix(first.rows, second.columns).map((value, row, column) => {
            let sum = 0

            for (let index = 0; index < first.columns; index += 1) {
                sum += first.content[row][index] * second.content[index][column]
            }

            return sum
        })
    }

    randomize(random = Math.random) {
        return this.map(() => random() * 2 - 1)
    }

    toJSON() {
        return {
            rows: this.rows,
            columns: this.columns,
            content: this.content,
        }
    }

    static fromJSON(json) {
        return new Matrix(json.rows, json.columns, json.content)
    }
}
