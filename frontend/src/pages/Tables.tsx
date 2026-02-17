import React from 'react'
import DataTable from '../components/DataTable'

export default function Tables() {
  // Sample data for demonstration
  const sampleData = [
    { name: 'Airi Satou', position: 'Accountant', office: 'Tokyo', age: 33, start_date: '2008/11/28', salary: '$162,700' },
    { name: 'Ashton Cox', position: 'Junior Technical Author', office: 'San Francisco', age: 66, start_date: '2009/01/12', salary: '$86,000' },
    { name: 'Bradley Greer', position: 'Software Engineer', office: 'London', age: 41, start_date: '2012/10/13', salary: '$132,000' },
    { name: 'Brielle Williamson', position: 'Integration Specialist', office: 'New York', age: 61, start_date: '2012/12/02', salary: '$372,000' },
    { name: 'Cedric Kelly', position: 'Senior Javascript Developer', office: 'Edinburgh', age: 22, start_date: '2012/03/29', salary: '$433,060' },
    { name: 'Charde Marshall', position: 'Regional Director', office: 'San Francisco', age: 36, start_date: '2008/10/16', salary: '$470,600' },
    { name: 'Colleen Hurst', position: 'Javascript Developer', office: 'San Francisco', age: 39, start_date: '2009/09/15', salary: '$205,500' },
    { name: 'Dai Rios', position: 'Personnel Lead', office: 'Edinburgh', age: 35, start_date: '2012/09/26', salary: '$217,500' },
    { name: 'Garrett Winters', position: 'Accountant', office: 'Tokyo', age: 63, start_date: '2011/07/25', salary: '$170,750' },
    { name: 'Gloria Little', position: 'Systems Administrator', office: 'New York', age: 59, start_date: '2009/04/10', salary: '$237,500' },
    { name: 'Herrod Chandler', position: 'Sales Assistant', office: 'San Francisco', age: 59, start_date: '2012/08/06', salary: '$137,500' },
    { name: 'Hope Fuentes', position: 'Secretary', office: 'San Francisco', age: 41, start_date: '2010/02/12', salary: '$109,850' },
    { name: 'Howard Hatfield', position: 'Office Manager', office: 'San Francisco', age: 51, start_date: '2008/12/16', salary: '$164,500' },
    { name: 'Jackson Bradshaw', position: 'Director', office: 'New York', age: 65, start_date: '2008/09/26', salary: '$645,750' },
    { name: 'Jena Gaines', position: 'Office Manager', office: 'London', age: 30, start_date: '2008/12/19', salary: '$90,560' },
    { name: 'Jennifer Chang', position: 'Regional Director', office: 'Singapore', age: 28, start_date: '2010/11/14', salary: '$357,650' },
    { name: 'Jenette Caldwell', position: 'Development Lead', office: 'New York', age: 30, start_date: '2011/09/03', salary: '$345,000' },
    { name: 'Jonas Alexander', position: 'Developer', office: 'San Francisco', age: 30, start_date: '2010/07/14', salary: '$86,500' },
    { name: 'Lael Greer', position: 'Systems Administrator', office: 'London', age: 21, start_date: '2009/02/27', salary: '$103,500' },
    { name: 'Michael Silva', position: 'Marketing Designer', office: 'London', age: 66, start_date: '2012/11/27', salary: '$198,500' },
    { name: 'Michelle House', position: 'Integration Specialist', office: 'Sidney', age: 37, start_date: '2011/06/02', salary: '$95,400' },
    { name: 'Paul Byrd', position: 'Chief Financial Officer (CFO)', office: 'New York', age: 64, start_date: '2010/06/09', salary: '$725,000' },
  ]

  const columns = [
    { key: 'name', label: 'NAME' },
    { key: 'position', label: 'POSITION' },
    { key: 'office', label: 'OFFICE' },
    { key: 'age', label: 'AGE' },
    { key: 'start_date', label: 'START DATE' },
    { key: 'salary', label: 'SALARY' },
  ]

  const basicTableData = [
    { id: 1, first_name: 'Mark', last_name: 'Otto', username: '@mdo' },
    { id: 2, first_name: 'Jacob', last_name: 'Thornton', username: '@fat' },
    { id: 3, first_name: 'Larry', last_name: 'the Bird', username: '@twitter' },
  ]

  const borderedTableData = [
    { id: 1, name: 'Cedric Kelly', progress: 35, salary: '$206,850', start_date: 'June 21, 2010' },
    { id: 2, name: 'Haley Kennedy', progress: 65, salary: '$313,500', start_date: 'May 15, 2013' },
    { id: 3, name: 'Bradley Greer', progress: 78, salary: '$132,000', start_date: 'Apr 12, 2014' },
  ]

  return (
    <div className="page">
      <div className="breadcrumb">
        <a href="/">Tables</a> / <span>Data Table</span>
      </div>

      <div className="card mb-6">
        <h3 className="mb-2">DATA TABLE</h3>
        <p className="text-muted mb-4">
          Read the <a href="https://datatables.net/" target="_blank" rel="noopener noreferrer" className="text-link">Official DataTables Documentation</a> for a full list of instructions and other options.
        </p>
        
        <DataTable columns={columns} data={sampleData} />
      </div>

      <div className="card mb-6">
        <h3 className="mb-4">BASIC TABLE</h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>FIRST NAME</th>
                <th>LAST NAME</th>
                <th>USERNAME</th>
              </tr>
            </thead>
            <tbody>
              {basicTableData.map(row => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.first_name}</td>
                  <td>{row.last_name}</td>
                  <td>{row.username}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="mb-4">HOVERABLE TABLE</h3>
        <div className="table-wrapper">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>#</th>
                <th>FIRST NAME</th>
                <th>LAST NAME</th>
                <th>USERNAME</th>
              </tr>
            </thead>
            <tbody>
              {basicTableData.map(row => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.first_name}</td>
                  <td>{row.last_name}</td>
                  <td>{row.username}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4">BORDERED TABLE</h3>
        <div className="table-wrapper">
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>#</th>
                <th>NAME</th>
                <th>PROGRESS</th>
                <th>SALARY</th>
                <th>START DATE</th>
              </tr>
            </thead>
            <tbody>
              {borderedTableData.map(row => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.name}</td>
                  <td>
                    <div className="progress-bar-wrapper">
                      <div className="progress-bar" style={{ width: `${row.progress}%`, background: row.progress > 70 ? '#10b981' : row.progress > 40 ? '#f59e0b' : '#ef4444' }}>
                        {row.progress}%
                      </div>
                    </div>
                  </td>
                  <td>{row.salary}</td>
                  <td>{row.start_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
