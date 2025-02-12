const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const moment = require("moment");

const app = express();
const port = 3000;

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "vehicle_spare_description",
  password: "ILOVEYOU3000",
  port: 5432,
});

pool.connect((err) => {
  if (err) {
    console.error("Database connection error:", err.stack);
    return;
  }
  console.log("Connected to database & Server is Online");
});

app.get("/", (req, res) => {
  res.render("vehicleHomepage.ejs");
});

app.get("/upload_vehicle_description", (req, res) => {
  res.render("vehicleDescription.ejs");
});

app.get("/upload_spare_parts_description", (req, res) => {
  res.render("sparePartDescription.ejs");
});

app.post("/upload_vehicle_description", async (req, res) => {
  if (!req.body || !req.body.category) {
    return res.status(400).send("Category is required!");
  }

  const { model_number, registration_number, vehicle_type, category } =
    req.body;

  const allowedCategories = ["a", "b", "c", "d", "e"];
  if (!allowedCategories.includes(category.toLowerCase())) {
    return res
      .status(400)
      .send(
        "Invalid category. Please select a valid option from the dropdown."
      ); // More informative message
  }

  const tableName = `veh_${category.toLowerCase()}`;
  try {
    await pool.query(
      `INSERT INTO ${tableName} (model_number, registration_number, vehicle_type) VALUES($1, $2, $3)`,
      [model_number, registration_number, vehicle_type]
    );
    res.send("Data updated successfully");
  } catch (error) {
    console.log(`Error in inserting data in: ${tableName}`, error);
    res.send(`Error in inserting data in: ${tableName}. Check the console.`);
  }
});

app.post("/upload_spare_parts_description", (req, res) => {
  const {
    bill_number,
    supplier_name,
    spare_part_purchased_for_vehicle,
    number_of_spare_part_purchased,
    spare_part_unique_id,
    spare_part_category,
    price_of_each_part,
    date_of_purchase,
    type_of_spare_part,
    name_of_the_spare_part,
  } = req.body;

  pool.query(
    "INSERT INTO spare_parts_purchases (bill_number, supplier_name, spare_part_purchased_for_vehicle, number_of_spare_part_purchased, spare_part_unique_id, spare_part_category, price_of_each_part, date_of_purchase, type_of_spare_part, name_of_the_spare_part) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [
      bill_number,
      supplier_name,
      spare_part_purchased_for_vehicle,
      number_of_spare_part_purchased,
      spare_part_unique_id,
      spare_part_category,
      price_of_each_part,
      date_of_purchase,
      type_of_spare_part,
      name_of_the_spare_part,
    ],
    (err, result) => {
      if (err) {
        console.error(err);
        res.send("Error inserting data.");
      } else {
        res.redirect("/");
      }
    }
  );
});

app.get("/showdata", (req, res) => {
  pool.query(
    "SELECT bill_number, TO_CHAR(date_of_purchase, 'DD/MM/YYYY') AS date_of_purchase_formatted, type_of_spare_part, name_of_the_spare_part, number_of_spare_part_purchased, spare_part_unique_id FROM spare_parts_purchases",
    (err, result) => {
      if (err) {
        console.error(err);
        res.send("Error fetching data.");
      } else {
        res.render("showdata", { data: result.rows });
      }
    }
  );
});

app.get("/update_spare_part_quantity", async (req, res) => {
  try {
    const typesResult = await pool.query(
      "SELECT DISTINCT type_of_spare_part FROM spare_parts_purchases"
    );
    const billNumbersResult = await pool.query(
      "SELECT DISTINCT bill_number FROM spare_parts_purchases"
    );
    const sparePartTypes = typesResult.rows.map(
      (row) => row.type_of_spare_part
    );
    const billNumbers = billNumbersResult.rows.map((row) => row.bill_number);
    res.render("updateSparePartQuantity", { sparePartTypes, billNumbers });
  } catch (error) {
    console.error("Error fetching spare part types:", error);
    res.send("Error fetching spare part types.");
  }
});

app.post("/update_spare_part_quantity", async (req, res) => {
  const { updateType, type_of_spare_part, bill_number, quantity_to_add } =
    req.body;

  if (updateType === "quantity") {
    const quantity = parseInt(quantity_to_add);
    if (isNaN(quantity)) {
      return res
        .status(400)
        .send(
          "Invalid quantity. Please enter a number to increase or decrease the quantity."
        );
    }

    try {
      const updateResult = await pool.query(
        "UPDATE spare_parts_purchases SET number_of_spare_part_purchased = number_of_spare_part_purchased - $1 WHERE type_of_spare_part = $2 AND bill_number = $3",
        [quantity, type_of_spare_part, bill_number]
      );

      await pool.query(
        "INSERT INTO issue_spare_part (bill_number, date_of_issue, type_of_spare_part, name_of_the_spare_part, number_of_spare_part_issued, price_of_each_part) SELECT $1::VARCHAR(255), current_timestamp, $2::VARCHAR(255), name_of_the_spare_part, $3, price_of_each_part FROM spare_parts_purchases WHERE type_of_spare_part = $2::VARCHAR(255) AND bill_number = $1 LIMIT 1",
        [bill_number, type_of_spare_part, quantity]
      );

      if (updateResult.rowCount === 0) {
        return res
          .status(404)
          .send(
            "Spare part type or Bill number not found or didn't match, Check the Inventory Stock."
          );
      }
      res.redirect("/showdata");
    } catch (error) {
      console.error("Error updating quantity:", error);
      res.status(500).send("Error updating quantity.");
    }
  } else {
    return res.status(400).send("Invalid update type.");
  }
});

app.get("/issue_spare_part", async (req, res) => {
  try {
    const typeResult = await pool.query(
      "SELECT DISTINCT type_of_spare_part FROM spare_parts_purchases"
    );
    const billNumbersResult = await pool.query(
      "SELECT DISTINCT bill_number FROM spare_parts_purchases"
    );
    const sparePartNames = await pool.query(
      "SELECT DISTINCT name_of_the_spare_part FROM spare_parts_purchases"
    );
    const sparePartPrice = await pool.query(
      "SELECT DISTINCT price_of_each_part FROM spare_parts_purchases"
    );

    const sparePartTypes = typeResult.rows.map((row) => row.type_of_spare_part);
    const billNumbers = billNumbersResult.rows.map((row) => row.bill_number);
    const sparePartNameResult = sparePartNames.rows.map(
      (row) => row.name_of_the_spare_part
    );
    const sparePartPriceResult = sparePartPrice.rows.map(
      (row) => row.price_of_each_part
    );

    res.render("issueSparePart", {
      sparePartTypes,
      billNumbers,
      sparePartNameResult,
      sparePartPriceResult,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Error fetching spare parts data."); // Improved error handling
  }
});

app.post("/issue_spare_part", async (req, res) => {
  const {
    bill_number,
    date_of_issue,
    type_of_spare_part,
    name_of_the_spare_part,
    price_of_each_part,
  } = req.body;

  const formattedDate = moment(date_of_issue).format("YYYY-MM-DD");

  try {
    await pool.query(
      "INSERT INTO issue_spare_part (bill_number, date_of_issue, type_of_spare_part, name_of_the_spare_part, price_of_each_part) VALUES($1, $2, $3, $4, $5)", // Added $6 and number_of_spare_part_issued
      [
        bill_number,
        formattedDate,
        type_of_spare_part,
        name_of_the_spare_part,
        price_of_each_part,
      ] // Added number_of_spare_part_issued
    );

    res.redirect("/update_spare_part_quantity");
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).send("Error issuing spare parts.");
  }
});

app.get("/show_issue_data", async (req, res) => {
  try {
    const result = await pool.query(`
          SELECT *
          FROM (
              SELECT *, ROW_NUMBER() OVER (ORDER BY serial_number) as rn
              FROM issue_spare_part
          ) AS subquery
          WHERE rn % 2 = 0;
      `);

    res.render("showIssueData", { issuedata: result.rows }); // Correct rendering
  } catch (error) {
    console.error("Error fetching even rows:", error);
    res.status(500).send("Error fetching data.");
  }
});

app.get('/update_issued_spare_part_qunatity', async(req, res) => {
  try {
    const billNumbersResult = await pool.query(`
      SELECT DISTINCT bill_number
      FROM (
          SELECT bill_number, ROW_NUMBER() OVER (ORDER BY bill_number) as rn
          FROM issue_spare_part
      ) AS numbered_rows
      WHERE rn % 2 = 0
  `);

  const selectSparePart = await pool.query(`
      SELECT DISTINCT type_of_spare_part
      FROM (
          SELECT type_of_spare_part, ROW_NUMBER() OVER (ORDER BY type_of_spare_part) as rn
          FROM issue_spare_part
      ) AS numbered_rows
      WHERE rn % 2 = 0
  `);

  const selectedBillNumber = billNumbersResult.rows.map((row) => row.bill_number);
  const selectedSparePart = selectSparePart.rows.map((row) => row.type_of_spare_part);
  res.render('updateIssuedSpareQuantity', {selectedBillNumber, selectedSparePart});
  } catch (error) {
    console.error('Error in fetching the data', error);
    res.status(500).send('Error in fetching the data');
  } 
})

app.get("/vehicle_service_entry", async (req, res) => {
  const selectIssuePart = await pool.query(
    "SELECT DISTINCT type_of_spare_part FROM issue_spare_part"
  );

  const selectedIssuePart = selectIssuePart.rows.map(
    (row) => row.type_of_spare_part
  );

  res.render("serviceEntry", { selectedIssuePart });
});

app.post("/vehicle_service_entry", async (req, res) => {
  const {
    date_of_service,
    category_of_vehicle,
    problem_in_vehicle,
    select_the_issued_part,
    price_after_servicing,
  } = req.body;

  try {
    pool.query(
      "INSERT INTO vehicle_service_entry (date_of_service, category_of_vehicle, problem_in_vehicle, select_the_issued_part, price_after_servicing) VALUES($1, $2, $3, $4, $5)",
      [
        date_of_service,
        category_of_vehicle,
        problem_in_vehicle,
        select_the_issued_part,
        price_after_servicing,
      ]
    );

    res.redirect("/");
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).send("Error issuing spare parts.");
  }
});

app.get("/vehicle_service_report", async (req, res) => {
  pool.query(
    "SELECT TO_CHAR(date_of_service, 'DD/MM/YYYY') AS date_of_service_formatted, category_of_vehicle, problem_in_vehicle, select_the_issued_part, price_after_servicing FROM vehicle_service_entry",
    (err, result) => {
      if (err) {
        console.error(err);
        res.send("Error fetching data.");
      } else {
        res.render("vehicleReport", { report: result.rows });
      }
    }
  );
});

app.get("/vehicle_usage", (req, res) => {
  res.render("vehicleUsage");
});

app.post("/vehicle_usage", async (req, res) => {
  const {
    vehicle_serial_number,
    vehicle_category,
    usage_date,
    time_in,
    reading_in,
    time_out,
    reading_out,
    fuel_input,
    fuel_output,
  } = req.body;

  try {
    pool.query(
      "INSERT INTO vehicle_usage (vehicle_serial_number, vehicle_category, usage_date, time_in, reading_in, time_out, reading_out, fuel_input, fuel_output) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", // Closing parenthesis added
      [
        vehicle_serial_number,
        vehicle_category,
        usage_date,
        time_in,
        reading_in,
        time_out,
        reading_out,
        fuel_input,
        fuel_output,
      ]
    );
    res.redirect("/");
  } catch (error) {
    console.error("Error in inserting the data", error);
    res.status(500).send("Error issuing spare parts.");
  }
});

app.get('/show_Vehicle_Usage_Report', async (req, res) => {
  try {
      const result = await pool.query(`
          SELECT 
              TO_CHAR(usage_date, 'DD/MM/YYYY') AS usage_date_formatted, 
              vehicle_serial_number, 
              vehicle_category, 
              time_in, 
              time_out, 
              TO_CHAR(total_usage_time, 'HH24:MI:SS') AS total_usage_time_formatted,
              reading_in, 
              reading_out, 
              fuel_input, 
              fuel_output, 
              usage_of_fuel 
          FROM vehicle_usage
      `);

      res.render("showVehicleUsageReport", { usageReport: result.rows });
  } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).send("Error fetching data.");
  }
});

app.listen(port, () => {
  console.log(`The server is open at http://localhost:${port}`);
});
